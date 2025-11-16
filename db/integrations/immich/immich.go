package immich

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"pocketbase/util"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/tkrajina/gpxgo/gpx"
)

type Integration struct {
	Active            bool   `json:"active"`
	URL               string `json:"url"`
	ApiKey            string `json:"apiKey"`
	TimeWindowMinutes int    `json:"timeWindowMinutes"`
	MaxDistanceMeters int    `json:"maxDistanceMeters"`
	MaxWaypoints      int    `json:"maxWaypoints"`
	UseForStrava      bool   `json:"useForStrava"`
	UseForKomoot      bool   `json:"useForKomoot"`
}

type metadataSearchResponse struct {
	Assets struct {
		Items    []Asset `json:"items"`
		NextPage *string `json:"nextPage"`
	} `json:"assets"`
}

type Asset struct {
	ID               string   `json:"id"`
	FileCreatedAt    string   `json:"fileCreatedAt"`
	OriginalFileName string   `json:"originalFileName"`
	ExifInfo         ExifInfo `json:"exifInfo"`
}

type ExifInfo struct {
	Latitude    *float64 `json:"latitude"`
	Longitude   *float64 `json:"longitude"`
	City        string   `json:"city"`
	Country     string   `json:"country"`
	Description string   `json:"description"`
}

type trackPoint struct {
	Lat       float64
	Lon       float64
	Distance  float64
	Timestamp *time.Time
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

func ParseIntegration(raw string, encryptionKey string) (*Integration, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var cfg Integration
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return nil, err
	}
	if !cfg.Active {
		return nil, nil
	}
	cfg.normalize()
	if cfg.ApiKey != "" && encryptionKey != "" && util.CanDecryptSecret(cfg.ApiKey) {
		decrypted, err := security.Decrypt(cfg.ApiKey, encryptionKey)
		if err != nil {
			return nil, err
		}
		cfg.ApiKey = string(decrypted)
	}
	return &cfg, nil
}

func (cfg *Integration) normalize() {
	cfg.URL = strings.TrimSpace(cfg.URL)
	if cfg.TimeWindowMinutes <= 0 {
		cfg.TimeWindowMinutes = 120
	}
	if cfg.MaxDistanceMeters <= 0 {
		cfg.MaxDistanceMeters = 150
	}
	if cfg.MaxWaypoints <= 0 {
		cfg.MaxWaypoints = 25
	}
}

func (cfg *Integration) baseURL() string {
	if cfg == nil {
		return ""
	}
	base := strings.TrimSpace(cfg.URL)
	if base == "" {
		return ""
	}
	base = strings.TrimRight(base, "/")
	if !strings.HasSuffix(base, "/api") {
		base = base + "/api"
	}
	return base
}

func (cfg *Integration) ShouldUseFor(provider string) bool {
	if cfg == nil || !cfg.Active || cfg.ApiKey == "" || cfg.URL == "" {
		return false
	}
	switch provider {
	case "strava":
		return cfg.UseForStrava
	case "komoot":
		return cfg.UseForKomoot
	default:
		return false
	}
}

func AttachWaypointsFromGPX(app core.App, cfg *Integration, userID, trailID string, gpxFile *filesystem.File) error {
	if cfg == nil || cfg.ApiKey == "" || gpxFile == nil {
		return nil
	}
	baseURL := cfg.baseURL()
	if baseURL == "" {
		return nil
	}
	points, err := loadTrackPoints(gpxFile)
	if err != nil {
		return err
	}
	if len(points) < 2 {
		return nil
	}
	boundsStart, boundsEnd, ok := timeBounds(points)
	if !ok {
		return nil
	}
	window := time.Duration(cfg.TimeWindowMinutes) * time.Minute
	takeAfter := boundsStart.Add(-window)
	takeBefore := boundsEnd.Add(window)
	assets, err := fetchAssets(baseURL, cfg.ApiKey, takeAfter, takeBefore, cfg.MaxWaypoints*3)
	if err != nil {
		return err
	}
	if len(assets) == 0 {
		return nil
	}
	matches := matchAssets(points, assets, cfg.MaxDistanceMeters)
	if len(matches) == 0 {
		return nil
	}
	if len(matches) > cfg.MaxWaypoints {
		matches = matches[:cfg.MaxWaypoints]
	}
	collection, err := app.FindCollectionByNameOrId("waypoints")
	if err != nil {
		return err
	}

	for _, match := range matches {
		photo, err := downloadAsset(baseURL, cfg.ApiKey, match.asset)
		if err != nil {
			return err
		}
		if photo == nil {
			continue
		}
		record := core.NewRecord(collection)
		record.Load(map[string]any{
			"name":                buildWaypointName(match.asset),
			"lat":                 match.point.Lat,
			"lon":                 match.point.Lon,
			"icon":                "camera",
			"author":              userID,
			"distance_from_start": match.point.Distance,
			"trail":               trailID,
		})
		desc := strings.TrimSpace(match.asset.ExifInfo.Description)
		if desc != "" {
			record.Set("description", desc)
		}
		record.Set("photos", photo)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

type assetMatch struct {
	asset    Asset
	point    trackPoint
	distance float64
}

func matchAssets(points []trackPoint, assets []Asset, maxDistance int) []assetMatch {
	threshold := float64(maxDistance)
	if threshold <= 0 {
		threshold = 150
	}
	matches := make([]assetMatch, 0, len(assets))
	for _, asset := range assets {
		if asset.ExifInfo.Latitude == nil || asset.ExifInfo.Longitude == nil {
			continue
		}
		nearest := findNearestTrackPoint(*asset.ExifInfo.Latitude, *asset.ExifInfo.Longitude, points)
		if nearest == nil || nearest.distance > threshold {
			continue
		}
		matches = append(matches, assetMatch{asset: asset, point: nearest.point, distance: nearest.distance})
	}
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].point.Distance < matches[j].point.Distance
	})
	return matches
}

type nearestPoint struct {
	point    trackPoint
	distance float64
}

func findNearestTrackPoint(lat, lon float64, points []trackPoint) *nearestPoint {
	var nearest *nearestPoint
	for _, p := range points {
		dist := haversineDistance(lat, lon, p.Lat, p.Lon)
		if nearest == nil || dist < nearest.distance {
			nearest = &nearestPoint{point: p, distance: dist}
		}
	}
	return nearest
}

func loadTrackPoints(gpxFile *filesystem.File) ([]trackPoint, error) {
	reader, err := gpxFile.Reader.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	buf, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	doc, err := gpx.ParseBytes(buf)
	if err != nil {
		return nil, err
	}
	var points []trackPoint
	var distance float64
	appendPoint := func(lat, lon float64, timestamp time.Time) {
		if len(points) > 0 {
			prev := points[len(points)-1]
			distance += haversineDistance(prev.Lat, prev.Lon, lat, lon)
		}
		var tsPtr *time.Time
		if !timestamp.IsZero() {
			ts := timestamp
			tsPtr = &ts
		}
		points = append(points, trackPoint{Lat: lat, Lon: lon, Distance: distance, Timestamp: tsPtr})
	}
	for _, track := range doc.Tracks {
		for _, segment := range track.Segments {
			for _, pt := range segment.Points {
				appendPoint(pt.Point.Latitude, pt.Point.Longitude, pt.Timestamp)
			}
		}
	}
	if len(points) == 0 {
		for _, route := range doc.Routes {
			for _, pt := range route.Points {
				appendPoint(pt.Point.Latitude, pt.Point.Longitude, pt.Timestamp)
			}
		}
	}
	return points, nil
}

func timeBounds(points []trackPoint) (time.Time, time.Time, bool) {
	var start, end time.Time
	for _, p := range points {
		if p.Timestamp == nil || p.Timestamp.IsZero() {
			continue
		}
		if start.IsZero() || p.Timestamp.Before(start) {
			start = *p.Timestamp
		}
		if end.IsZero() || p.Timestamp.After(end) {
			end = *p.Timestamp
		}
	}
	if start.IsZero() || end.IsZero() {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

func fetchAssets(baseURL, apiKey string, takenAfter, takenBefore time.Time, maxAssets int) ([]Asset, error) {
	if maxAssets <= 0 {
		maxAssets = 25
	}
	assets := make([]Asset, 0, maxAssets)
	page := 1
	for len(assets) < maxAssets {
		body := map[string]any{
			"withExif":    true,
			"takenAfter":  takenAfter.Format(time.RFC3339),
			"takenBefore": takenBefore.Format(time.RFC3339),
			"page":        page,
		}
		payload, _ := json.Marshal(body)
		req, err := http.NewRequest("POST", fmt.Sprintf("%s/search/metadata", baseURL), bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-api-key", apiKey)
		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		bodyBytes, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("immich search failed: %d", resp.StatusCode)
		}
		var payloadResp metadataSearchResponse
		if err := json.Unmarshal(bodyBytes, &payloadResp); err != nil {
			return nil, err
		}
		assets = append(assets, payloadResp.Assets.Items...)
		if payloadResp.Assets.NextPage == nil || *payloadResp.Assets.NextPage == "" {
			break
		}
		nextPage, ok := parseNextPage(*payloadResp.Assets.NextPage)
		if !ok {
			break
		}
		page = nextPage
	}
	if len(assets) > maxAssets {
		assets = assets[:maxAssets]
	}
	return assets, nil
}

func parseNextPage(raw string) (int, bool) {
	if n, err := strconv.Atoi(raw); err == nil {
		return n, true
	}
	if idx := strings.Index(raw, "page="); idx >= 0 {
		part := raw[idx+5:]
		for i, r := range part {
			if r < '0' || r > '9' {
				part = part[:i]
				break
			}
		}
		if n, err := strconv.Atoi(part); err == nil {
			return n, true
		}
	}
	return 0, false
}

func downloadAsset(baseURL, apiKey string, asset Asset) (*filesystem.File, error) {
	attempts := []string{
		fmt.Sprintf("%s/assets/%s/original", baseURL, asset.ID),
		fmt.Sprintf("%s/assets/%s/thumbnail?size=preview", baseURL, asset.ID),
	}
	for _, url := range attempts {
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("x-api-key", apiKey)
		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			resp.Body.Close()
			continue
		}
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		if len(data) == 0 {
			continue
		}
		file, err := filesystem.NewFileFromBytes(data, fmt.Sprintf("%s.jpg", asset.ID))
		if err != nil {
			return nil, err
		}
		return file, nil
	}
	return nil, nil
}

func buildWaypointName(asset Asset) string {
	parts := make([]string, 0, 2)
	if strings.TrimSpace(asset.ExifInfo.City) != "" {
		parts = append(parts, strings.TrimSpace(asset.ExifInfo.City))
	}
	if strings.TrimSpace(asset.ExifInfo.Country) != "" {
		parts = append(parts, strings.TrimSpace(asset.ExifInfo.Country))
	}
	if len(parts) == 0 {
		return "Imported from Immich"
	}
	return strings.Join(parts, ", ")
}

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const radius = 6371000.0
	lat1Rad := lat1 * math.Pi / 180
	lon1Rad := lon1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	lon2Rad := lon2 * math.Pi / 180
	dLat := lat2Rad - lat1Rad
	dLon := lon2Rad - lon1Rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return radius * c
}
