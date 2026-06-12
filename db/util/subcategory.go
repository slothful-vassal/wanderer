package util

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

type defaultSubcategorySeed struct {
	parentCategory string
	name           string
	shortName      string
	badgeIcon      string
	translations   map[string]CategoryTranslation
	aliases        []string
}

var defaultSubcategories = []defaultSubcategorySeed{
	{parentCategory: "Biking", name: "MTB", shortName: "MTB", badgeIcon: "mountain"},
	{parentCategory: "Biking", name: "Gravel", shortName: "GRVL"},
	{
		parentCategory: "Biking",
		name:           "Road",
		shortName:      "ROAD",
		badgeIcon:      "grip-lines-vertical",
		translations:   subcategoryTranslations("Road", "Rennrad", "ROAD"),
	},
	{parentCategory: "Biking", name: "E-Bike", shortName: "EBIKE", badgeIcon: "bolt"},
	{
		parentCategory: "Hiking",
		name:           "Winter",
		shortName:      "WINT",
		badgeIcon:      "snowflake",
		aliases:        []string{"Winter Hiking"},
		translations: map[string]CategoryTranslation{
			"de": {Name: "Winterwandern", ShortName: "WINT"},
			"en": {Name: "Winter", ShortName: "WINT"},
		},
	},
	{
		parentCategory: "Hiking",
		name:           "Alpine",
		shortName:      "ALP",
		badgeIcon:      "mountain",
		aliases:        []string{"Alpine Hiking"},
		translations:   subcategoryTranslations("Alpine", "Bergwandern", "ALP"),
	},
	{
		parentCategory: "Hiking",
		name:           "Long-distance",
		shortName:      "LONG",
		aliases:        []string{"Long-distance Hiking"},
		translations:   subcategoryTranslations("Long-distance", "Fernwandern", "LONG"),
	},
	{
		parentCategory: "Hiking",
		name:           "Snowshoeing",
		shortName:      "SNOW",
		badgeIcon:      "snowflake",
		translations:   subcategoryTranslations("Snowshoeing", "Schneeschuhwandern", "SNOW"),
	},
	{
		parentCategory: "Hiking",
		name:           "Family",
		shortName:      "FAM",
		badgeIcon:      "child",
		aliases:        []string{"Family Hiking"},
		translations:   subcategoryTranslations("Family", "Familienwandern", "FAM"),
	},
	{
		parentCategory: "Hiking",
		name:           "Pilgrimage",
		shortName:      "PILG",
		badgeIcon:      "cross",
		translations:   subcategoryTranslations("Pilgrimage", "Pilgern", "PILG"),
	},
	{
		parentCategory: "Running",
		name:           "Trail",
		shortName:      "TRAIL",
		aliases:        []string{"Trail Running"},
		translations:   subcategoryTranslations("Trail", "Trailrunning", "TRAIL"),
	},
	{
		parentCategory: "Running",
		name:           "Road",
		shortName:      "ROAD",
		badgeIcon:      "grip-lines-vertical",
		aliases:        []string{"Road Running"},
		translations:   subcategoryTranslations("Road", "Straßenlauf", "ROAD"),
	},
	{
		parentCategory: "Skiing",
		name:           "Cross-country",
		shortName:      "NORD",
		aliases:        []string{"Cross-country Skiing"},
		translations:   subcategoryTranslations("Cross-country", "Langlauf", "NORD"),
	},
	{
		parentCategory: "Skiing",
		name:           "Skating",
		shortName:      "SKATE",
		translations:   subcategoryTranslations("Skating", "Skating", "SKATE"),
	},
	{
		parentCategory: "Skiing",
		name:           "Backcountry",
		shortName:      "BACK",
		aliases:        []string{"Backcountry Skiing"},
		translations:   subcategoryTranslations("Backcountry", "Skitour", "BACK"),
	},
}

func subcategoryTranslations(en string, de string, shortName string) map[string]CategoryTranslation {
	return map[string]CategoryTranslation{
		"de": {Name: de, ShortName: shortName},
		"en": {Name: en, ShortName: shortName},
	}
}

func ValidateSubcategoryRecord(app core.App, record *core.Record) error {
	parentCategory := record.GetString("category")
	if parentCategory == "" {
		return fmt.Errorf("subcategory category is required")
	}

	name := record.GetString("name")
	normalizedName := NormalizeCategoryName(name)

	allSubcategories, err := app.FindAllRecords("subcategories")
	if err != nil {
		return err
	}

	for _, existing := range allSubcategories {
		if existing.Id == record.Id || existing.GetString("category") != parentCategory {
			continue
		}

		if NormalizeCategoryName(existing.GetString("name")) == normalizedName {
			return fmt.Errorf("subcategory name %q collides with existing subcategory %q in the same category after normalization", name, existing.GetString("name"))
		}
	}

	if _, err := ParseCategoryTranslations(record.Get("translations")); err != nil {
		return err
	}

	return nil
}

func ValidateTrailSubcategoryRecord(app core.App, record *core.Record, subcategoryExplicit bool) error {
	subcategoryID := record.GetString("subcategory")
	if subcategoryID == "" {
		return nil
	}

	categoryID := record.GetString("category")
	if categoryID == "" {
		if !subcategoryExplicit {
			record.Set("subcategory", "")
			return nil
		}

		return fmt.Errorf("trail subcategory requires a category")
	}

	subcategory, err := app.FindRecordById("subcategories", subcategoryID)
	if err != nil {
		if !subcategoryExplicit {
			record.Set("subcategory", "")
			return nil
		}

		return fmt.Errorf("trail subcategory %q does not exist: %w", subcategoryID, err)
	}

	parentCategory := subcategory.GetString("category")
	if parentCategory != categoryID {
		if !subcategoryExplicit {
			record.Set("subcategory", "")
			return nil
		}

		return fmt.Errorf("trail subcategory %q belongs to category %q, not %q", subcategoryID, parentCategory, categoryID)
	}

	return nil
}

func FindSubcategoryByNormalizedName(app core.App, categoryID string, name string) (*core.Record, error) {
	normalizedName := NormalizeCategoryName(name)
	if categoryID == "" || normalizedName == "" {
		return nil, nil
	}

	subcategories, err := app.FindRecordsByFilter(
		"subcategories",
		"category = {:category}",
		"",
		0,
		0,
		map[string]any{"category": categoryID},
	)
	if err != nil {
		return nil, err
	}

	for _, subcategory := range subcategories {
		if NormalizeCategoryName(subcategory.GetString("name")) == normalizedName {
			return subcategory, nil
		}
	}

	return nil, nil
}

func ResolveCategoryAndSubcategoryByNormalizedNames(app core.App, categoryName string, subcategoryName string) (*core.Record, *core.Record, error) {
	category, err := FindCategoryByNormalizedName(app, categoryName)
	if err != nil || category == nil {
		return category, nil, err
	}

	subcategory, err := FindSubcategoryByNormalizedName(app, category.Id, subcategoryName)
	if err != nil {
		return category, nil, err
	}

	return category, subcategory, nil
}

func BackfillRemoteTrailCategory(app core.App, category *core.Record) error {
	if category == nil || category.Id == "" {
		return nil
	}

	subcategoriesByName, err := normalizedSubcategoriesByName(app, category.Id)
	if err != nil {
		return err
	}

	trails, err := app.FindRecordsByFilter(
		"trails",
		"remote_category != '' && category = ''",
		"",
		0,
		0,
		nil,
	)
	if err != nil {
		return err
	}

	normalizedCategoryName := NormalizeCategoryName(category.GetString("name"))
	for _, trail := range trails {
		if NormalizeCategoryName(trail.GetString("remote_category")) != normalizedCategoryName {
			continue
		}

		trail.Set("category", category.Id)
		if subcategory, ok := subcategoriesByName[NormalizeCategoryName(trail.GetString("remote_subcategory"))]; ok {
			trail.Set("subcategory", subcategory.Id)
		}

		if err := app.Save(trail); err != nil {
			return err
		}
	}

	return nil
}

func BackfillRemoteTrailSubcategory(app core.App, subcategory *core.Record) error {
	if subcategory == nil || subcategory.Id == "" {
		return nil
	}

	category, err := app.FindRecordById("categories", subcategory.GetString("category"))
	if err != nil {
		return err
	}

	trails, err := app.FindRecordsByFilter(
		"trails",
		"remote_subcategory != '' && subcategory = '' && (category = {:category} || category = '')",
		"",
		0,
		0,
		map[string]any{"category": category.Id},
	)
	if err != nil {
		return err
	}

	normalizedCategoryName := NormalizeCategoryName(category.GetString("name"))
	normalizedSubcategoryName := NormalizeCategoryName(subcategory.GetString("name"))
	for _, trail := range trails {
		categoryID := trail.GetString("category")
		if categoryID == "" {
			if NormalizeCategoryName(trail.GetString("remote_category")) != normalizedCategoryName {
				continue
			}
			trail.Set("category", category.Id)
		}

		if NormalizeCategoryName(trail.GetString("remote_subcategory")) != normalizedSubcategoryName {
			continue
		}

		trail.Set("subcategory", subcategory.Id)
		if err := app.Save(trail); err != nil {
			return err
		}
	}

	return nil
}

func normalizedSubcategoriesByName(app core.App, categoryID string) (map[string]*core.Record, error) {
	subcategories, err := app.FindRecordsByFilter(
		"subcategories",
		"category = {:category}",
		"",
		0,
		0,
		map[string]any{"category": categoryID},
	)
	if err != nil {
		return nil, err
	}

	byName := make(map[string]*core.Record, len(subcategories))
	for _, subcategory := range subcategories {
		normalizedName := NormalizeCategoryName(subcategory.GetString("name"))
		if normalizedName == "" {
			continue
		}
		byName[normalizedName] = subcategory
	}

	return byName, nil
}

func SeedDefaultSubcategories(app core.App) error {
	subcategoriesCollection, err := app.FindCollectionByNameOrId("subcategories")
	if err != nil {
		return err
	}

	for _, seed := range defaultSubcategories {
		categories, err := app.FindRecordsByFilter(
			"categories",
			"name = {:name}",
			"",
			1,
			0,
			map[string]any{"name": seed.parentCategory},
		)
		if err != nil {
			return err
		}
		if len(categories) == 0 {
			continue
		}
		category := categories[0]

		existing, err := app.FindRecordsByFilter(
			"subcategories",
			"category = {:category}",
			"",
			0,
			0,
			map[string]any{"category": category.Id},
		)
		if err != nil {
			return err
		}
		if existingRecord := findDefaultSubcategory(existing, seed.name, seed.aliases); existingRecord != nil {
			changed, err := applyDefaultSubcategorySeed(existingRecord, seed)
			if err != nil {
				return err
			}
			if changed {
				if err := app.Save(existingRecord); err != nil {
					return fmt.Errorf("failed to update seeded subcategory %q: %w", seed.name, err)
				}
			}
			continue
		}

		record := core.NewRecord(subcategoriesCollection)
		record.Set("category", category.Id)
		record.Set("name", seed.name)
		record.Set("short_name", seed.shortName)
		if seed.badgeIcon != "" {
			record.Set("badge_icon", seed.badgeIcon)
		}
		if len(seed.translations) > 0 {
			record.Set("translations", seed.translations)
		}
		if err := app.Save(record); err != nil {
			return fmt.Errorf("failed to seed subcategory %q: %w", seed.name, err)
		}
	}

	return nil
}

func applyDefaultSubcategorySeed(record *core.Record, seed defaultSubcategorySeed) (bool, error) {
	changed := false

	if isDefaultSubcategoryAlias(record.GetString("name"), seed.aliases) {
		record.Set("name", seed.name)
		changed = true
	}

	if record.GetString("short_name") == "" && seed.shortName != "" {
		record.Set("short_name", seed.shortName)
		changed = true
	}

	if record.GetString("badge_icon") == "" && seed.badgeIcon != "" {
		record.Set("badge_icon", seed.badgeIcon)
		changed = true
	}

	if len(seed.translations) > 0 {
		currentTranslations, err := ParseCategoryTranslations(record.Get("translations"))
		if err != nil {
			return false, fmt.Errorf("invalid existing translations for subcategory %q: %w", record.GetString("name"), err)
		}

		mergedTranslations, translationsChanged := mergeDefaultSubcategoryTranslations(seed.translations, currentTranslations)
		if translationsChanged {
			record.Set("translations", mergedTranslations)
			changed = true
		}
	}

	return changed, nil
}

func isDefaultSubcategoryAlias(name string, aliases []string) bool {
	normalizedName := NormalizeCategoryName(name)
	for _, alias := range aliases {
		if normalizedName == NormalizeCategoryName(alias) {
			return true
		}
	}

	return false
}

func mergeDefaultSubcategoryTranslations(staticTranslations map[string]CategoryTranslation, currentTranslations map[string]CategoryTranslation) (map[string]CategoryTranslation, bool) {
	if currentTranslations == nil {
		currentTranslations = map[string]CategoryTranslation{}
	}

	changed := false
	for locale, staticTranslation := range staticTranslations {
		translation := currentTranslations[locale]
		localeChanged := false
		if translation.Name == "" && staticTranslation.Name != "" {
			translation.Name = staticTranslation.Name
			localeChanged = true
		}
		if translation.ShortName == "" && staticTranslation.ShortName != "" {
			translation.ShortName = staticTranslation.ShortName
			localeChanged = true
		}
		if localeChanged {
			changed = true
			currentTranslations[locale] = translation
		}
	}

	return currentTranslations, changed
}

func findDefaultSubcategory(records []*core.Record, name string, aliases []string) *core.Record {
	normalizedName := NormalizeCategoryName(name)
	for _, record := range records {
		if NormalizeCategoryName(record.GetString("name")) == normalizedName {
			return record
		}
	}

	normalizedAliases := map[string]struct{}{}
	for _, alias := range aliases {
		normalizedAliases[NormalizeCategoryName(alias)] = struct{}{}
	}

	for _, record := range records {
		if _, ok := normalizedAliases[NormalizeCategoryName(record.GetString("name"))]; ok {
			return record
		}
	}

	return nil
}
