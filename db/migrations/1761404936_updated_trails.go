package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("e864strfxo14pm4")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(23, []byte(`{
			"hidden": false,
			"id": "json3158417006",
			"maxSize": 5242880,
			"name": "surface",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "json"
		}`)); err != nil {
			return err
		}

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(12, []byte(`{
			"hidden": false,
			"id": "k8xdrsyv",
			"maxSelect": 1,
			"maxSize": 5242880,
			"mimeTypes": [],
			"name": "gpx",
			"presentable": false,
			"protected": false,
			"required": false,
			"system": false,
			"thumbs": null,
			"type": "file"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("e864strfxo14pm4")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("json3158417006")

		// update field
		if err := collection.Fields.AddMarshaledJSONAt(12, []byte(`{
			"hidden": false,
			"id": "k8xdrsyv",
			"maxSelect": 1,
			"maxSize": 5242880,
			"mimeTypes": null,
			"name": "gpx",
			"presentable": false,
			"protected": false,
			"required": false,
			"system": false,
			"thumbs": null,
			"type": "file"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	})
}
