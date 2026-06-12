package util

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/types"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

var supportedCategoryLocales = map[string]struct{}{
	"cs": {},
	"de": {},
	"en": {},
	"es": {},
	"eu": {},
	"fr": {},
	"hu": {},
	"it": {},
	"nl": {},
	"no": {},
	"pl": {},
	"pt": {},
	"ru": {},
	"zh": {},
}

var defaultCategoryNames = []string{"Hiking", "Walking", "Running", "Climbing", "Skiing", "Canoeing", "Biking"}

func DefaultCategoryNames() []string {
	return append([]string(nil), defaultCategoryNames...)
}

var defaultCategoryTranslations = map[string]map[string]string{
	"Biking": {
		"cs": "Cyklistika",
		"de": "Radfahren",
		"en": "Biking",
		"es": "Ciclismo",
		"eu": "Bizikleta",
		"fr": "Vélo",
		"hu": "Biking",
		"it": "Ciclismo",
		"nl": "Fietsen",
		"no": "Sykling",
		"pl": "Rower",
		"pt": "Ciclismo",
		"ru": "Велоспорт",
		"zh": "骑行",
	},
	"Canoeing": {
		"cs": "Kanoistika",
		"de": "Kanufahren",
		"en": "Canoeing",
		"es": "Remo",
		"eu": "Kanoa",
		"fr": "Canoë",
		"hu": "Canoeing",
		"it": "Canoa",
		"nl": "Kanoën",
		"no": "Padling",
		"pl": "Kajak",
		"pt": "Canoagem",
		"ru": "Каякинг",
		"zh": "划艇",
	},
	"Climbing": {
		"cs": "Horolezectví",
		"de": "Klettern",
		"en": "Climbing",
		"es": "Escalada",
		"eu": "Eskalada",
		"fr": "Escalade",
		"hu": "Climbing",
		"it": "Arrampicata",
		"nl": "Klimmen",
		"no": "Klatring",
		"pl": "Wspinaczka",
		"pt": "Escalada",
		"ru": "Скалолазание",
		"zh": "攀岩",
	},
	"Hiking": {
		"cs": "Turistika",
		"de": "Wandern",
		"en": "Hiking",
		"es": "Senderismo",
		"eu": "Mendi-ibilaldia",
		"fr": "Randonnée",
		"hu": "Hiking",
		"it": "Escursionismo",
		"nl": "Hiken",
		"no": "Vandring",
		"pl": "Wędrówka",
		"pt": "Montanhismo",
		"ru": "Пеший туризм",
		"zh": "徒步",
	},
	"Running": {
		"cs": "Běh",
		"de": "Laufen",
		"en": "Running",
		"es": "Carrera",
		"eu": "Korrika",
		"fr": "Course à pied",
		"hu": "Futás",
		"it": "Corsa",
		"nl": "Hardlopen",
		"no": "Løping",
		"pl": "Bieganie",
		"pt": "Corrida",
		"ru": "Бег",
		"zh": "跑步",
	},
	"Skiing": {
		"de": "Skifahren",
		"no": "Skisport",
	},
	"Walking": {
		"cs": "Chůze",
		"de": "Spazieren",
		"en": "Walking",
		"es": "Paseo",
		"eu": "Oinez",
		"fr": "Marche",
		"hu": "Walking",
		"it": "Camminare",
		"nl": "Wandelen",
		"no": "Gåtur",
		"pl": "Spacer",
		"pt": "Caminhada",
		"ru": "Прогулка",
		"zh": "步行",
	},
}

var defaultCategoryIcons = map[string]string{
	"Biking":   "person-biking",
	"Canoeing": "sailboat",
	"Climbing": "mountain",
	"Hiking":   "person-hiking",
	"Running":  "person-running",
	"Skiing":   "person-skiing-nordic",
	"Walking":  "person-walking",
}

var deprecatedDefaultCategoryIcons = map[string]map[string]struct{}{
	"Canoeing": {
		"ship": {},
	},
	"Climbing": {
		"mountain-sun": {},
	},
	"Skiing": {
		"person-skiing": {},
	},
}

type CategoryTranslation struct {
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
}

type categoryCollisionCandidate struct {
	id      string
	name    string
	created string
}

func NormalizeCategoryName(name string) string {
	decomposed := norm.NFD.String(name)

	var b strings.Builder
	b.Grow(len(decomposed))
	for _, r := range decomposed {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}

	folded := cases.Fold().String(b.String())

	b.Reset()
	b.Grow(len(folded))
	lastWasSeparator := false
	for _, r := range folded {
		if unicode.IsSpace(r) || r == '-' || r == '_' {
			if !lastWasSeparator {
				b.WriteByte(' ')
				lastWasSeparator = true
			}
			continue
		}

		b.WriteRune(r)
		lastWasSeparator = false
	}

	return strings.TrimSpace(b.String())
}

func ParseCategoryTranslations(raw any) (map[string]CategoryTranslation, error) {
	if raw == nil {
		return nil, nil
	}

	switch value := raw.(type) {
	case map[string]CategoryTranslation:
		return value, nil
	case map[string]any:
		return normalizeCategoryTranslations(value)
	case types.JSONRaw:
		if len(value) == 0 {
			return nil, nil
		}

		var decoded map[string]any
		if err := json.Unmarshal(value, &decoded); err != nil {
			return nil, fmt.Errorf("translations must be valid JSON: %w", err)
		}

		return normalizeCategoryTranslations(decoded)
	case []byte:
		if len(value) == 0 {
			return nil, nil
		}

		var decoded map[string]any
		if err := json.Unmarshal(value, &decoded); err != nil {
			return nil, fmt.Errorf("translations must be valid JSON: %w", err)
		}

		return normalizeCategoryTranslations(decoded)
	case string:
		if strings.TrimSpace(value) == "" {
			return nil, nil
		}

		var decoded map[string]any
		if err := json.Unmarshal([]byte(value), &decoded); err != nil {
			return nil, fmt.Errorf("translations must be valid JSON: %w", err)
		}

		return normalizeCategoryTranslations(decoded)
	default:
		return nil, fmt.Errorf("translations must be a JSON object")
	}
}

func ValidateCategoryRecord(app core.App, record *core.Record) error {
	name := record.GetString("name")
	normalizedName := NormalizeCategoryName(name)

	allCategories, err := app.FindAllRecords("categories")
	if err != nil {
		return err
	}

	for _, existing := range allCategories {
		if existing.Id == record.Id {
			continue
		}

		if NormalizeCategoryName(existing.GetString("name")) == normalizedName {
			return fmt.Errorf("category name %q collides with existing category %q after normalization", name, existing.GetString("name"))
		}
	}

	if _, err := ParseCategoryTranslations(record.Get("translations")); err != nil {
		return err
	}

	return nil
}

func FindCategoryByNormalizedName(app core.App, name string) (*core.Record, error) {
	normalizedName := NormalizeCategoryName(name)
	if normalizedName == "" {
		return nil, nil
	}

	allCategories, err := app.FindAllRecords("categories")
	if err != nil {
		return nil, err
	}

	for _, category := range allCategories {
		if NormalizeCategoryName(category.GetString("name")) == normalizedName {
			return category, nil
		}
	}

	return nil, nil
}

func ValidateCategoryCollectionState(app core.App) error {
	allCategories, err := app.FindAllRecords("categories")
	if err != nil {
		return err
	}

	seen := map[string]string{}
	for _, category := range allCategories {
		name := category.GetString("name")
		normalizedName := NormalizeCategoryName(name)
		if other, ok := seen[normalizedName]; ok {
			return fmt.Errorf("category normalization collision: %q conflicts with %q", name, other)
		}
		seen[normalizedName] = name

		if _, err := ParseCategoryTranslations(category.Get("translations")); err != nil {
			return fmt.Errorf("invalid translations for category %q: %w", name, err)
		}
	}

	return nil
}

func ResolveCategoryNameCollisions(app core.App) error {
	allCategories, err := app.FindAllRecords("categories")
	if err != nil {
		return err
	}

	candidates := make([]categoryCollisionCandidate, 0, len(allCategories))
	for _, category := range allCategories {
		candidates = append(candidates, categoryCollisionCandidate{
			id:      category.Id,
			name:    category.GetString("name"),
			created: category.GetString("created"),
		})
	}
	resolvedNames := resolveCategoryNameCollisions(candidates)

	for _, category := range allCategories {
		resolvedName, ok := resolvedNames[category.Id]
		if !ok {
			continue
		}

		originalName := category.GetString("name")
		category.Set("name", resolvedName)
		if err := app.Save(category); err != nil {
			return fmt.Errorf("failed to resolve category name collision for %q: %w", originalName, err)
		}
	}

	return nil
}

func DeleteCategoryImageFiles(app core.App) error {
	allCategories, err := app.FindAllRecords("categories")
	if err != nil {
		return err
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return err
	}
	defer fsys.Close()

	var failures []error
	for _, category := range allCategories {
		for _, filename := range categoryImageFilenames(category) {
			if filename == "" || strings.ContainsAny(filename, `/\`) {
				continue
			}

			path := category.BaseFilesPath() + "/" + filename
			if err := fsys.Delete(path); err != nil && !errors.Is(err, filesystem.ErrNotFound) {
				failures = append(failures, fmt.Errorf("failed to delete category image %q: %w", path, err))
			}

			if errs := fsys.DeletePrefix(category.BaseFilesPath() + "/thumbs_" + filename + "/"); len(errs) > 0 {
				failures = append(failures, fmt.Errorf("failed to delete category image thumbs for %q: %w", path, errors.Join(errs...)))
			}
		}
	}

	if len(failures) > 0 {
		return errors.Join(failures...)
	}

	return nil
}

func PrepopulateDefaultCategoryTranslations(app core.App) error {
	allCategories, err := app.FindAllRecords("categories")
	if err != nil {
		return err
	}

	for _, category := range allCategories {
		staticTranslations, ok := defaultCategoryTranslations[category.GetString("name")]
		if !ok {
			continue
		}

		currentTranslations, err := ParseCategoryTranslations(category.Get("translations"))
		if err != nil {
			return fmt.Errorf("invalid existing translations for category %q: %w", category.GetString("name"), err)
		}
		mergedTranslations, changed := mergeDefaultCategoryTranslations(staticTranslations, currentTranslations)
		if !changed {
			continue
		}

		category.Set("translations", mergedTranslations)
		if err := app.Save(category); err != nil {
			return fmt.Errorf("failed to prepopulate translations for category %q: %w", category.GetString("name"), err)
		}
	}

	return nil
}

func PrepopulateDefaultCategoryIcons(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("categories")
	if err != nil {
		return err
	}
	if collection.Fields.GetByName("icon") == nil {
		return nil
	}

	allCategories, err := app.FindAllRecords("categories")
	if err != nil {
		return err
	}

	for _, category := range allCategories {
		categoryName := category.GetString("name")
		defaultIcon, ok := defaultCategoryIcons[categoryName]
		if !ok {
			continue
		}

		currentIcon := strings.TrimSpace(category.GetString("icon"))
		if currentIcon == defaultIcon {
			continue
		}
		if currentIcon != "" {
			deprecatedIcons := deprecatedDefaultCategoryIcons[categoryName]
			if _, ok := deprecatedIcons[currentIcon]; !ok {
				continue
			}
		}

		category.Set("icon", defaultIcon)
		if err := app.Save(category); err != nil {
			return fmt.Errorf("failed to prepopulate icon for category %q: %w", category.GetString("name"), err)
		}
	}

	return nil
}

func normalizeCategoryTranslations(raw map[string]any) (map[string]CategoryTranslation, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	translations := make(map[string]CategoryTranslation, len(raw))
	for locale, entry := range raw {
		tag, err := language.Parse(locale)
		if err != nil {
			return nil, fmt.Errorf("translations locale %q is invalid", locale)
		}
		base, _ := tag.Base()
		if locale != base.String() {
			return nil, fmt.Errorf("translations locale %q must use the base locale %q", locale, base.String())
		}
		if _, ok := supportedCategoryLocales[base.String()]; !ok {
			return nil, fmt.Errorf("translations locale %q is not supported", locale)
		}

		entryMap, ok := entry.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("translations[%s] must be an object", locale)
		}

		translation := CategoryTranslation{}
		if name, ok := entryMap["name"]; ok {
			nameString, ok := name.(string)
			if !ok {
				return nil, fmt.Errorf("translations[%s].name must be a string", locale)
			}
			translation.Name = nameString
		}

		if shortName, ok := entryMap["short_name"]; ok {
			shortNameString, ok := shortName.(string)
			if !ok {
				return nil, fmt.Errorf("translations[%s].short_name must be a string", locale)
			}
			translation.ShortName = shortNameString
		}

		translations[locale] = translation
	}

	return translations, nil
}

func collisionResolvedCategoryName(name string, id string, seen map[string]struct{}) string {
	baseName := strings.TrimSpace(name)
	if baseName == "" {
		baseName = "Category"
	}

	for i := 0; ; i++ {
		suffix := id
		if i > 0 {
			suffix = fmt.Sprintf("%s-%d", id, i+1)
		}

		candidate := fmt.Sprintf("%s (%s)", baseName, suffix)
		if _, ok := seen[NormalizeCategoryName(candidate)]; !ok {
			return candidate
		}
	}
}

func resolveCategoryNameCollisions(candidates []categoryCollisionCandidate) map[string]string {
	sorted := append([]categoryCollisionCandidate(nil), candidates...)
	sort.SliceStable(sorted, func(i, j int) bool {
		left := sorted[i]
		right := sorted[j]

		leftName := NormalizeCategoryName(left.name)
		rightName := NormalizeCategoryName(right.name)
		if leftName != rightName {
			return leftName < rightName
		}

		if left.created != right.created {
			return left.created < right.created
		}

		return left.id < right.id
	})

	seen := map[string]struct{}{}
	resolved := map[string]string{}
	for _, category := range sorted {
		normalizedName := NormalizeCategoryName(category.name)
		if _, ok := seen[normalizedName]; !ok {
			seen[normalizedName] = struct{}{}
			continue
		}

		resolvedName := collisionResolvedCategoryName(category.name, category.id, seen)
		resolved[category.id] = resolvedName
		seen[NormalizeCategoryName(resolvedName)] = struct{}{}
	}

	return resolved
}

func mergeDefaultCategoryTranslations(staticTranslations map[string]string, currentTranslations map[string]CategoryTranslation) (map[string]CategoryTranslation, bool) {
	if currentTranslations == nil {
		currentTranslations = map[string]CategoryTranslation{}
	}

	changed := false
	for locale, name := range staticTranslations {
		if name == "" {
			continue
		}

		translation := currentTranslations[locale]
		if translation.Name != "" {
			continue
		}

		translation.Name = name
		currentTranslations[locale] = translation
		changed = true
	}

	return currentTranslations, changed
}

func categoryImageFilenames(record *core.Record) []string {
	filenames := record.GetStringSlice("img")
	if len(filenames) > 0 {
		return filenames
	}

	filename := record.GetString("img")
	if filename == "" {
		return nil
	}

	return []string{filename}
}
