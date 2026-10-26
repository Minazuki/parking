package beacon

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	drand "github.com/drand/drand/v2/crypto"
)

const ChainHash = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
const publicKey = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"
const BaseURL = "https://api.drand.sh/v2/chains/" + ChainHash
const Genesis int64 = 1692803367
const Period int64 = 3
const groupHash = "f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e"

type State struct {
	SchemaVersion         int    `json:"schemaVersion"`
	Provider              string `json:"provider"`
	APIVersion            string `json:"apiVersion"`
	ChainHash             string `json:"chainHash"`
	Seed                  string `json:"seed"`
	Round                 uint64 `json:"round"`
	ButtonPressedAt       string `json:"buttonPressedAt"`
	RequestStartedAt      string `json:"requestStartedAt"`
	ResponseReceivedAt    string `json:"responseReceivedAt"`
	RoundScheduledTimeUTC string `json:"roundScheduledTimeUtc"`
	SignatureVerified     bool   `json:"signatureVerified"`
}
type Evidence struct {
	State        State
	Info, Beacon []byte
}
type info struct {
	PublicKey string `json:"public_key"`
	Period    int64  `json:"period"`
	Genesis   int64  `json:"genesis_time"`
	Seed      string `json:"genesis_seed"`
	Hash      string `json:"chain_hash"`
	Scheme    string `json:"scheme"`
	ID        string `json:"beacon_id"`
}
type wire struct {
	Round     uint64 `json:"round"`
	Signature string `json:"signature"`
}
type signed struct {
	round     uint64
	signature []byte
}

func (b signed) GetRound() uint64             { return b.round }
func (b signed) GetSignature() []byte         { return b.signature }
func (b signed) GetPreviousSignature() []byte { return nil }
func verifyInfo(raw []byte) error {
	var x info
	if err := json.Unmarshal(raw, &x); err != nil {
		return err
	}
	if x.PublicKey != publicKey || x.Period != Period || x.Genesis != Genesis || x.Seed != groupHash || x.Hash != ChainHash || x.Scheme != "bls-unchained-g1-rfc9380" || x.ID != "quicknet" {
		return fmt.Errorf("chain info differs from pinned quicknet parameters")
	}
	return nil
}
func Verify(infoRaw, beaconRaw []byte) (string, uint64, string, error) {
	if err := verifyInfo(infoRaw); err != nil {
		return "", 0, "", err
	}
	var b wire
	if err := json.Unmarshal(beaconRaw, &b); err != nil {
		return "", 0, "", err
	}
	if b.Round < 1 || b.Round > 9007199254740991 {
		return "", 0, "", fmt.Errorf("invalid round")
	}
	sig, err := hex.DecodeString(b.Signature)
	if err != nil || len(sig) != 48 {
		return "", 0, "", fmt.Errorf("invalid quicknet signature encoding")
	}
	scheme, err := drand.GetSchemeByID("bls-unchained-g1-rfc9380")
	if err != nil {
		return "", 0, "", err
	}
	keyBytes, _ := hex.DecodeString(publicKey)
	key := scheme.KeyGroup.Point()
	if err := key.UnmarshalBinary(keyBytes); err != nil {
		return "", 0, "", err
	}
	if err := scheme.VerifyBeacon(signed{b.Round, sig}, key); err != nil {
		return "", 0, "", fmt.Errorf("BLS verification: %w", err)
	}
	seconds := Genesis + (int64(b.Round)-1)*Period
	when := time.Unix(seconds, 0).UTC()
	if when.Year() > 9999 {
		return "", 0, "", fmt.Errorf("round time outside RFC3339 range")
	}
	hash := sha256.Sum256(sig)
	return hex.EncodeToString(hash[:]), b.Round, when.Format("2006-01-02T15:04:05.000Z"), nil
}
func Validate(e Evidence) error {
	seed, round, scheduled, err := Verify(e.Info, e.Beacon)
	if err != nil {
		return err
	}
	if e.State.Seed != seed || e.State.Round != round || e.State.ChainHash != ChainHash || e.State.RoundScheduledTimeUTC != scheduled || !e.State.SignatureVerified {
		return fmt.Errorf("seed state differs from signed beacon")
	}
	a, ea := time.Parse(time.RFC3339Nano, e.State.ButtonPressedAt)
	b, eb := time.Parse(time.RFC3339Nano, e.State.RequestStartedAt)
	c, ec := time.Parse(time.RFC3339Nano, e.State.ResponseReceivedAt)
	if ea != nil || eb != nil || ec != nil || a.After(b) || b.After(c) {
		return fmt.Errorf("invalid seed request timestamps")
	}
	return nil
}

type Fetcher struct {
	Client  *http.Client
	BaseURL string
}

func (f Fetcher) Fetch(ctx context.Context) (Evidence, error) {
	var e Evidence
	client := f.Client
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	base := f.BaseURL
	if base == "" {
		base = BaseURL
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	stamp := func() string { return time.Now().UTC().Format(time.RFC3339Nano) }
	pressed := stamp()
	get := func(url string) ([]byte, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Cache-Control", "no-cache")
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20+1))
		if err != nil {
			return nil, err
		}
		if len(raw) > 1<<20 {
			return nil, fmt.Errorf("drand response too large")
		}
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("drand HTTP %d", resp.StatusCode)
		}
		return raw, nil
	}
	var err error
	e.Info, err = get(base + "/info")
	if err != nil {
		return e, err
	}
	if err := verifyInfo(e.Info); err != nil {
		return e, err
	}
	started := stamp()
	e.Beacon, err = get(base + "/rounds/latest")
	received := stamp()
	if err != nil {
		return e, err
	}
	seed, round, scheduled, err := Verify(e.Info, e.Beacon)
	if err != nil {
		return e, err
	}
	e.State = State{1, "drand", "v2", ChainHash, seed, round, pressed, started, received, scheduled, true}
	return e, nil
}
