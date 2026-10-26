package app

import "time"

// The next annual activity follows the calendar year at server startup in Taiwan.
func nextActivityYear(now time.Time) int {
	return now.In(time.FixedZone("Asia/Taipei", 8*60*60)).Year() - 1911 + 1
}
