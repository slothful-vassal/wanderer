package migrations

import (
	"os"

	"github.com/meilisearch/meilisearch-go"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	client := meilisearch.New(os.Getenv("MEILI_URL"), meilisearch.WithAPIKey(os.Getenv("MEILI_MASTER_KEY")))

	m.Register(func(app core.App) error {
		_, err := client.Index("trails").UpdateSortableAttributes(&[]string{
			"created", "date", "difficulty", "distance", "elevation_gain", "elevation_loss", "name", "duration", "author",
		})

		if err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		_, err := client.Index("trails").UpdateSortableAttributes(&[]string{
			"created", "date", "difficulty", "distance", "elevation_gain", "elevation_loss", "name",
		})

		if err != nil {
			return err
		}

		return nil
	})
}
