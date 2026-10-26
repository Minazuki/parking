package domain

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	shared "github.com/Minazuki/parking/schemas"
	jsonschema "github.com/santhosh-tekuri/jsonschema/v5"
)

type Validator struct {
	stages       [7]*jsonschema.Schema
	activity     *jsonschema.Schema
	registration *jsonschema.Schema
}

func NewValidator() (*Validator, error) {
	c := jsonschema.NewCompiler()
	c.AssertFormat = true
	c.LoadURL = func(url string) (io.ReadCloser, error) { return nil, fmt.Errorf("schema is not embedded: %s", url) }
	entries, err := shared.Files.ReadDir("checkpoints")
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".schema.json") {
			continue
		}
		raw, err := shared.Files.ReadFile("checkpoints/" + entry.Name())
		if err != nil {
			return nil, err
		}
		var id struct {
			ID string `json:"$id"`
		}
		if err := json.Unmarshal(raw, &id); err != nil {
			return nil, err
		}
		if err := c.AddResource(id.ID, bytes.NewReader(raw)); err != nil {
			return nil, err
		}
	}
	v := &Validator{}
	for n := range v.stages {
		v.stages[n], err = c.Compile(fmt.Sprintf("urn:parking:schema:stage-%d", n))
		if err != nil {
			return nil, err
		}
	}
	v.activity, err = c.Compile("urn:parking:schema:activity")
	if err != nil {
		return nil, err
	}
	v.registration, err = c.Compile("urn:parking:schema:registration-input")
	return v, err
}
func parse(raw []byte) (any, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var x any
	if err := d.Decode(&x); err != nil {
		return nil, err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return nil, fmt.Errorf("trailing JSON data")
	}
	return x, nil
}
func (v *Validator) Validate(stage int, raw []byte) error {
	if stage < 0 || stage > 6 {
		return fmt.Errorf("unknown stage %d", stage)
	}
	x, err := parse(raw)
	if err != nil {
		return err
	}
	return v.stages[stage].Validate(x)
}
func (v *Validator) Activity(raw []byte) error {
	x, err := parse(raw)
	if err != nil {
		return err
	}
	return v.activity.Validate(x)
}
func EqualJSON(a, b []byte) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	xa, _ := json.Marshal(x)
	ya, _ := json.Marshal(y)
	return bytes.Equal(xa, ya)
}
func Encode(x any) ([]byte, error) {
	raw, err := json.MarshalIndent(x, "", "  ")
	return append(raw, '\n'), err
}

func (v *Validator) Registration(raw []byte) error {
	x, err := parse(raw)
	if err != nil {
		return err
	}
	return v.registration.Validate(x)
}
