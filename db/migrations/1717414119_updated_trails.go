package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {

		collection, err := app.FindCollectionByNameOrId("e864strfxo14pm4")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("author = @request.auth.id || public = true || (trail_share_via_trail.user ?= @request.auth.id)")

		return app.Save(collection)
	}, func(app core.App) error {

		collection, err := app.FindCollectionByNameOrId("e864strfxo14pm4")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("author = @request.auth.id || public = true || (trail_share_via_trail.user = @request.auth.id)")

		return app.Save(collection)
	})
}
