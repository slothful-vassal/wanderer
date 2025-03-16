package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"id": "1mns8mlal6uf9ku",
			"created": "2024-05-09 17:48:01.382Z",
			"updated": "2024-05-09 17:48:01.382Z",
			"name": "trail_share",
			"type": "base",
			"system": false,
			"schema": [
				{
					"system": false,
					"id": "eskurfx6",
					"name": "trail",
					"type": "relation",
					"required": true,
					"presentable": false,
					"unique": false,
					"options": {
						"collectionId": "e864strfxo14pm4",
						"cascadeDelete": true,
						"minSelect": null,
						"maxSelect": 1,
						"displayFields": null
					}
				},
				{
					"system": false,
					"id": "yyzimwee",
					"name": "user",
					"type": "relation",
					"required": true,
					"presentable": false,
					"unique": false,
					"options": {
						"collectionId": "_pb_users_auth_",
						"cascadeDelete": true,
						"minSelect": null,
						"maxSelect": 1,
						"displayFields": null
					}
				},
				{
					"system": false,
					"id": "zr7aaqxl",
					"name": "permission",
					"type": "select",
					"required": true,
					"presentable": false,
					"unique": false,
					"options": {
						"maxSelect": 1,
						"values": [
							"view",
							"edit"
						]
					}
				}
			],
			"indexes": [],
			"listRule": "trail.author = @request.auth.id",
			"viewRule": "trail.author = @request.auth.id",
			"createRule": "trail.author = @request.auth.id",
			"updateRule": "trail.author = @request.auth.id",
			"deleteRule": "trail.author = @request.auth.id",
			"options": {}
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {

		collection, err := app.FindCollectionByNameOrId("1mns8mlal6uf9ku")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
