# Routing-Plugin-Konzept

> **Internes Design-Dokument**
> Dies ist die Design-Rationale und das Ziel-Narrativ für das Routing-Plugin.
> Die **normative, prüfbare Spezifikation** liegt in `openspec/specs/routing/`
> und den Phasen-Deltas unter `openspec/changes/`. Bei Abweichungen ist OpenSpec
> maßgeblich; dieses Dokument erklärt das „Warum" und wird entfernt, sobald die
> Phasen umgesetzt und manuell validiert sind.

Dieses Dokument beschreibt den Zielzustand für Routing-Plugins in Wanderer. Es baut auf dem Plugin-System für `trails`-Plugins und der Erweiterung um `assets`-Plugins auf. Ziel ist, die aktuelle direkte Valhalla-Integration durch einen generischen Plugin-Typ `routing` zu ersetzen. Valhalla soll dabei das erste First-Party-Routing-Plugin bleiben; BRouter soll als zweites First-Party-Plugin zeigen, dass die Abstraktion auch für eine strukturell andere Engine trägt.

## Zielzustand

Wanderer behandelt Routing und Höheninformationen als austauschbare Plugin-Capabilities hinter einer provider-neutralen Host-API. Nutzer denken in Wanderer-Intents wie Wandern, Tourenrad, Gravel oder Auto, nicht in provider-spezifischen Begriffen. Mehrere Engines können dieselbe Anfrage parallel beantworten, sodass der Editor vergleichbare Alternativen nebeneinander anzeigen kann.

Valhalla und BRouter sollen beide First-Party-Routing-Plugins sein. Valhalla ist kostenmodell-/optionsbasiert, BRouter profil- und `.brf`-basiert. Zusammen prüfen sie die wichtigste Architekturfrage: Ob Wanderer eine gemeinsame Routing-Sprache anbieten kann, ohne die nativen Profilsprachen der Provider ineinander übersetzen zu müssen.

Für die Konzeptvalidierung wird GraphHopper als dritter Referenzfall mitgedacht. GraphHopper ist nicht primärer Umsetzungsfokus, hilft aber, die Abstraktion gegen eine weitere offene Routing-Engine zu prüfen: vordefinierte Profile, Custom Models, alternative Routen, Elevation und serverseitige HTTP-API liegen dort anders als bei Valhalla und BRouter.

## Tragende Festlegungen

- Der kanonische Wanderer-Intent ist die gemeinsame Routing-Sprache und der autoritative Vergleichsschlüssel. Vergleichbarkeit ist nur innerhalb desselben Intent-Keys definiert.
- Native Profile sind Plugin-Dialekte. Mappings sind die Pflichtbrücke zwischen Wanderer-Intents und provider-spezifischen Profilen oder Optionen.
- Das Frontend spricht ausschließlich die Wanderer-Routing-API. Provider-spezifische Request- und Response-Formate, Credentials und Profilformate bleiben in der Plugin-Schicht.
- Der Host besitzt Discovery, User-Instanzen, Orchestrierung, parallelen Fan-out, Teilfehler-Aggregation, Policy Enforcement und Persistenz. Plugins besitzen nur die Übersetzung in das Provider-Protokoll.
- `route.v1` und `elevation.v1` sind unabhängige Capabilities. Routing und Höheninformationen können von unterschiedlichen Plugins kommen.
- Nutzer können eigene Routing-Profile anlegen, inklusive provider-spezifischer Profildateien wie BRouter-`.brf`.
- Mehrere Routing-Engines können für denselben Nutzer aktiv sein. Der Routen-Editor kann Alternativen von einer oder mehreren Engines anfragen.

## Permanente Grenzen

- Keine Cross-Engine-Routenoptimierung: Der Host orchestriert unabhängige Kandidaten mehrerer Engines, stitcht aber keine Segmente verschiedener Engines zu einer optimierten Route zusammen.
- Keine gemeinsame native Profilsprache: Wanderer-Intents mappen auf native Profile. Sie übersetzen keine BRouter-`.brf`-Profile in Valhalla `costing_options` oder umgekehrt.
- Plugins erhalten keinen direkten Netzwerkzugriff. Sie nutzen weiter die bestehenden Host-Requests über deklarierte Connectors.
- Plugins persistieren keine beliebigen Dateien selbst. User-Profile und Profildateien gehören dem Host und werden Plugins nur als begrenzter Input übergeben.

## Aktueller Zustand

Routing ist aktuell stark an Valhalla gekoppelt:

- `/api/v1/valhalla/route` proxied Valhalla `/route`.
- `/api/v1/valhalla/height` proxied Valhalla `/height`.
- `web/src/lib/models/valhalla.ts` modelliert Valhalla-Costing und Responses.
- `web/src/lib/stores/valhalla_store.svelte.ts` baut Valhalla-Requests, decodiert Valhalla-Shapes und ruft Höhenkorrektur auf.
- `GPX.correctElevation()` ruft direkt `/api/v1/valhalla/height` auf.

Der gewünschte Zustand ist:

- Das Frontend besitzt Route Editing, GPX-State und UI-Verhalten.
- Der Backend-Host besitzt Plugin Discovery, User-Instanzen, Orchestrierung, Policy und Persistenz.
- Routing-Plugins besitzen provider-spezifische Protokollübersetzung.

## Plugin-Manifest

Ein Routing-Plugin nutzt die bestehende Plugin-Bundle-Struktur:

```json
{
  "manifestVersion": "1.0",
  "id": "valhalla",
  "type": "routing",
  "name": "Valhalla",
  "version": "0.1.0",
  "runtime": {
    "type": "wasm",
    "entrypoint": "plugin.wasm"
  },
  "capabilities": [
    {
      "name": "route",
      "version": "v1",
      "export": "route_v1"
    },
    {
      "name": "elevation",
      "version": "v1",
      "export": "elevation_v1"
    }
  ],
  "permissions": {
    "network": {
      "connectors": [
        {
          "name": "api",
          "type": "configured",
          "configKey": "valhalla",
          "allowedPathPrefixes": ["/route", "/height"]
        }
      ]
    },
    "downloads": {
      "maxBytes": 4194304,
      "contentTypes": ["application/json"]
    }
  },
  "hostConfig": {
    "connectors": {
      "valhalla": {
        "baseURL": "https://valhalla1.openstreetmap.de",
        "basePath": "",
        "allowPrivate": false
      }
    },
    "routing": {
      "roles": ["route", "elevation"],
      "defaultProfiles": ["pedestrian", "hiking", "bicycle", "mountain_bike", "auto"]
    }
  },
  "metadata": {
    "routing": {
      "version": "v1",
      "roles": ["route", "elevation"],
      "modes": ["foot", "bike", "motor"],
      "supportsSegmentGeometry": true,
      "supportsShapeRanges": false,
      "supportsAlternatives": true,
      "maxAlternatives": 3,
      "supportsRouteElevation": true,
      "supportsElevation": true,
      "nativeProfileUpload": {
        "enabled": false
      }
    }
  }
}
```

Das Manifest beschreibt, was ein Plugin kann. Es ist nicht die Quelle der User-Präferenzen. Einstellungen wie "BRouter als primäre Routing-Engine und Valhalla für Höheninformationen" liegen in host-eigenen User-Einstellungen.

## Capabilities

Routing-Plugins starten mit zwei unabhängigen Capabilities.

| Capability | Zweck |
| --- | --- |
| `route.v1` | Berechnet einen oder mehrere Routenkandidaten zwischen geordneten Ankerpunkten. |
| `elevation.v1` | Liefert Höhenwerte für eine bestehende Linie oder Punktliste. |

Die Trennung ist wichtig, weil eine Engine für eine Aufgabe stark sein kann und für die andere nicht. BRouter kann starkes Routing liefern, während Valhalla weiterhin Höheninformationen beisteuert. Ein zukünftiges Elevation-only-Plugin soll gültig sein, ohne `route.v1` zu implementieren.

### `route.v1` input

Der Host sendet normalisierten, bereits aufgelösten Routing-Input an das ausgewählte Plugin. Der kanonische Wanderer-Intent ist nicht Teil des Plugin-Inputs; der Host hat ihn bereits in ein natives Profil, `nativeConfig` und kanonische Preferences übersetzt.

```json
{
  "instance": {
    "id": "abc123",
    "pluginId": "brouter"
  },
  "auth": {},
  "config": {},
  "request": {
    "anchors": [
      { "lat": 47.3769, "lon": 8.5417 },
      { "lat": 47.3850, "lon": 8.5600 }
    ],
    "mode": "bike",
    "profile": {
      "id": "profile_123",
      "pluginId": "brouter",
      "key": "trekking",
      "kind": "builtin",
      "contentBase64": "",
      "contentType": "",
      "nativeConfig": {}
    },
    "preferences": {
      "speedKmh": 18,
      "hillPreference": 0.5
    },
    "requiredPreferences": [],
    "options": {
      "alternatives": 3,
      "includeElevation": false,
      "language": "de"
    }
  }
}
```

`preferences` sind absichtlich generisch und optional. Ein Plugin mappt unterstützte Werte in sein natives Format und ignoriert nicht unterstützte Werte. Provider-spezifische Advanced-Einstellungen gehören in native Profile, Plugin-Konfiguration oder `native_config`, nicht in die generische API. `profile.nativeConfig` ist der Zustellweg für solche aufgelösten provider-spezifischen Mapping-Optionen, z.B. Valhalla-`costing_options` oder Template-Parameter für ein BRouter-Profil. `mode` bleibt im Plugin-Input als Convenience und Validierungshilfe erhalten, obwohl viele Plugins ihn aus dem aufgelösten Profil ableiten können.

`auth` und `config` sind keine routing-spezifischen Schemas. Sie sind die vom Basis-Plugin-System bereitgestellten, host-seitig aufgelösten Instance-Daten für diese konkrete Plugin-Invocation. `config` enthält nicht-geheime Instanzkonfiguration, `auth` enthält nur die für das Plugin freigegebenen Auth-Metadaten oder Referenzen. Credentials für Provider-HTTP-Requests werden weiterhin vom Host am Connector angebracht. Die Routing-Spezifikation behandelt beide Objekte als opaque; ein Routing-Plugin muss seine erwarteten Config- Felder in der Plugin-Metadata dokumentieren. Wenn keine Daten nötig sind, sendet der Host `{}`.

`options.alternatives` ist die Anzahl nativer Kandidaten, die der Host bei dieser konkreten Engine anfragt; sie ist nicht identisch mit der finalen UI-Anzahl `desiredVariants`. `options.includeElevation` darf `false` sein, auch wenn der Host-Request Elevation angefragt hat, wenn der Host Höhen separat über `elevation.v1` orchestriert.

### `route.v1` output

Plugins liefern normalisierte Routenkandidaten:

```json
{
  "candidates": [
    {
      "id": "primary",
      "profileKey": "trekking",
      "geometry": {
        "format": "encoded_polyline",
        "precision": 6,
        "coordinates": "..."
      },
      "summary": {
        "distance": 1234.5,
        "duration": 987,
        "elevationGain": 120.0,
        "elevationLoss": 118.0
      },
      "segments": [
        {
          "fromAnchor": 0,
          "toAnchor": 1,
          "geometry": {
            "format": "encoded_polyline",
            "precision": 6,
            "coordinates": "..."
          },
          "distance": 1234.5,
          "duration": 987
        }
      ],
      "warnings": []
    }
  ],
  "error": null
}
```

Das Plugin liefert keine `provider`-, `pluginId`- oder `instanceId`-Felder im Kandidaten. Diese Provenienz kennt der Host aus der Invocation und ergänzt sie erst in der Host-Route-Response.

Pflicht:

| Feld | Pflicht |
| --- | --- |
| `candidates` oder `error` | Genau eine verwertbare Ergebnisform. |
| `candidate.id` | Native Kandidaten-ID, eindeutig innerhalb der Plugin-Response. |
| `candidate.segments` | Segmentvertrag für alle benachbarten Anchor-Paare. |
| `candidate.summary.distance` | Gesamtdistanz in Metern. |
| `candidate.summary.duration` | Gesamtdauer in Sekunden. |
| `segment.fromAnchor` / `segment.toAnchor` | Anchor-Zuordnung des Segments. |
| `segment.distance` | Segmentdistanz in Metern. |
| `segment.duration` | Segmentdauer in Sekunden. |
| Segment-`geometry` oder `shapeRange` | Entweder eigene Segment-Polyline oder Slice in Kandidaten-Polyline. |

Optional:

| Feld | Bedeutung |
| --- | --- |
| `candidate.geometry` | Gesamtgeometrie für Preview, Vergleich und `shapeRange`. |
| `summary.elevationGain` / `summary.elevationLoss` | Höhenmetrik, wenn das Plugin brauchbare Höhen kennt. |
| `warnings` | Plugin-Warnings zum Kandidaten oder Ergebnis. |

Pflicht-Geometrieformat für Plugin-Output ist `encoded_polyline` mit `precision: 6`. Dieses Format ist normativ festgelegt: Es verwendet den Google Encoded Polyline Algorithm mit Skalierungsfaktor `1e6`. Die decodierte Punktliste besteht aus WGS84-Paaren in der Reihenfolge `[lat, lon]`, also Latitude zuerst und Longitude danach. Diese Reihenfolge gilt für Kandidaten- Geometrien, Segment-Geometrien, `shapeRange`-Slices und `elevation.v1`- Geometrien. GeoJSON-übliche `[lon, lat]`-Koordinaten sind in diesem Feld nicht zulässig. GPX und GeoJSON sind keine Pflicht-Outputformate für Plugins; der Host bleibt die einzige GPX-Autorität.

Der Host konvertiert akzeptierte Kandidaten zu GPX für den bestehenden Editor. Der aktuelle Editor ist segmentorientiert: Jede Strecke zwischen zwei benachbarten Ankerpunkten liegt als ein `trkseg` vor, und Undo/Redo, Insert, Edit, Delete, Crop und Anchor-Reordering arbeiten über diese Segment-Indizes. Ein Routenkandidat muss deshalb die Beziehung zwischen Anchors und Segmenten erhalten.

`geometry` auf Kandidatenebene ist optionale Gesamtgeometrie. Sie ist nützlich für Preview, Vergleich und Summary. `segments` ist der editor-kompatible Vertrag und muss ein Segment pro benachbartem Anchor-Paar enthalten:

```text
anchors[0] -> anchors[1] = segments[0]
anchors[1] -> anchors[2] = segments[1]
anchors[n] -> anchors[n+1] = segments[n]
```

Jedes Segment sollte eigene Encoded-Polyline-Geometrie, Distanz und Dauer enthalten. Das ist die bevorzugte Ausgabeform, weil der Host jedes Segment direkt als ein GPX-`trkseg` materialisieren und Zeitstempel pro Segment aus `duration` ableiten kann.

Wenn eine Engine nur eine optimierte Gesamtgeometrie zurückgeben kann, darf das Plugin stattdessen `shapeRange` pro Segment liefern:

```json
{
  "fromAnchor": 0,
  "toAnchor": 1,
  "shapeRange": {
    "start": 0,
    "end": 42
  },
  "distance": 1234.5,
  "duration": 987
}
```

`shapeRange.start` und `shapeRange.end` sind inklusive Punkt-Indizes in der decodierten Kandidaten-Geometrie, also in der normierten `[lat, lon]`- Punktliste. Segment-Geometrie bleibt bevorzugt, weil sie Mehrdeutigkeiten beim host-seitigen Slicing geteilter Grenzpunkte vermeidet.

Der Editor soll nicht mehr wissen müssen, ob die Linie aus Valhalla, BRouter, GraphHopper, OSRM oder host-nativer Luftlinie stammt.

### `elevation.v1` input

Elevation-Requests müssen mit Linien funktionieren, die von beliebigen Plugins oder aus host-nativer Luftlinie stammen:

```json
{
  "instance": {
    "id": "def456",
    "pluginId": "valhalla"
  },
  "auth": {},
  "config": {},
  "request": {
    "geometry": {
      "format": "encoded_polyline",
      "precision": 6,
      "coordinates": "..."
    },
    "options": {
      "preserveExisting": true
    }
  }
}
```

`geometry` nutzt wie `route.v1` das Pflichtformat `encoded_polyline` mit `precision: 6`. `options.preserveExisting` signalisiert, dass der Host bei fehlenden oder ungültigen neuen Höhen vorhandene GPX-Höhen punktweise behalten soll.

`auth` und `config` folgen derselben Semantik wie bei `route.v1`: Sie sind opaque Instance-Daten aus dem Basis-Plugin-System, nicht Teil des provider-neutralen Elevation-Vertrags.

### `elevation.v1` output

```json
{
  "heights": [412.3, null, 415.8],
  "source": {
    "label": "Valhalla height"
  },
  "warnings": [
    {
      "code": "elevation_partial",
      "message": "Height missing for 1 point."
    }
  ],
  "error": null
}
```

Festlegungen:

- `heights.length` muss der Anzahl decodierter Geometriepunkte entsprechen, außer das Plugin liefert einen strukturierten Fehler.
- Jeder Höhenwert ist Meter über Meer oder `null`.
- `null` bedeutet: Das Plugin hat für diesen Punkt keine verlässliche Höhe.
- Gültige neue Höhenwerte ersetzen vorhandene Höhen punktweise.
- Bei `null` behält der Host vorhandene GPX-Höhen für diesen Punkt bei, sofern vorhanden.
- Wenn bei `null` keine vorhandene Höhe existiert, bleibt der Punkt ohne Höhe.

Aus einem `elevation.v1`-Call leitet der Host nur die Statuswerte `complete`, `partial` oder `failed` ab. `included`, `none` und `pending` sind rein host-seitige Zustände. Die kanonische Enum-Tabelle steht in der Host-Route-Response.

## Provider-Profillandschaft

"Profil" bedeutet je nach Engine etwas anderes. Wanderer muss deshalb zwischen generischen Wanderer-Intents für Standardnutzer und provider-nativen Profilen für Advanced-Use-Cases unterscheiden.

Für Standardnutzer bietet Wanderer eine stabile Liste kanonischer Intents. Für Advanced-Nutzer können Plugins zusätzlich provider-spezifische Profile, Optionen oder Upload-Formate anbieten.

### Valhalla-Profile

Valhalla bietet primär keine benannten Profildateien an. Valhalla nutzt `costing`-Modelle plus `costing_options`. Ein Valhalla-Plugin mappt Wanderer-Intents auf diese Costings und Options-Presets.

Dokumentierte Valhalla-Costing-Modelle:

| Valhalla costing | Wanderer-Kategorie | Hinweise |
| --- | --- | --- |
| `pedestrian` | Foot | Walking-Routing; bevorzugt Gehwege und Fußwege leicht, meidet Stufen und Gassen leicht. |
| `bicycle` | Bike | Fahrrad-Routing mit konfigurierbarem Fahrradtyp, Oberfläche, Hügeln, Straßen, Fähren und Geschwindigkeit. |
| `auto` | Motor | Auto-Routing mit Auto-Zugang und Turn Restrictions. |
| `truck` | Motor | Wie Auto, aber mit Truck-Zugang und Fahrzeuggrenzen wie Breite, Höhe und Gewicht. |
| `bus` | Motor / Transitbetrieb | Straßenrouting für Busse. Für Wanderer-Normalnutzer eher nicht relevant. |
| `taxi` | Motor | Wie Auto, kann aber taxi-zugängliche Spuren bevorzugen. |
| `motor_scooter` | Motor | Scooter-/Moped-Routing, typischerweise mit Vermeidung höherer Straßenklassen. |
| `motorcycle` | Motor / Adventure | Beta; kann zwischen Straßentouring und Tracks/Trails getuned werden. |
| `bikeshare` | Mixed | Beta; kombiniert Fuß- und Fahrradrouting über Bike-Share-Stationen. |
| `auto_pedestrian` | Mixed | Beta; startet mit Auto und endet zu Fuß, mit Parkplätzen als Übergang. |
| `multimodal` | Transit | Fuß plus Transit; benötigt Transitdaten und ist kein einfaches Outdoor-Profil. |

Valhalla unterstützt außerdem Optionen wie `shortest`, Avoid-/Favor-Faktoren, harte Exclusions, Alternativrouten, Sprache, Datum/Zeit und Formatoptionen. Das Plugin sollte Standardnutzern nur eine kuratierte Teilmenge zeigen und rohe `costing_options` als provider-spezifische Advanced-Konfiguration behandeln.

Sinnvolle Valhalla-Built-ins für Wanderer:

| Wanderer-Profil | Valhalla-Mapping |
| --- | --- |
| `walking` | `pedestrian` mit konservativen Walking-Defaults. |
| `hiking` | `pedestrian` mit trail-/track-freundlichen und hügelbewussten Optionen, soweit möglich. |
| `road_bike` | `bicycle` mit `bicycle_type: "Road"` und Präferenz für befestigte Straßen. |
| `touring_bike` | `bicycle` mit `bicycle_type: "Hybrid"` und balancierter Road-/Cycleway-Präferenz. |
| `mountain_bike` | `bicycle` mit `bicycle_type: "Mountain"` und höherer Toleranz für Tracks/Oberflächen. |
| `car` | `auto`. |
| `scooter` | `motor_scooter`. |
| `motorcycle` | `motorcycle`, als Advanced oder Beta markiert. |

### BRouter-Profile

BRouter ist profilzentriert. Ein Profil ist ein `.brf`-Cost-Function-Skript, nicht nur ein Preset-Name. Dadurch eignet sich BRouter besonders gut für hochgeladene User-Profile, weil das native Format bereits persönliche Routing-Präferenzen ausdrückt.

BRouter nutzt `profiles2` für Lookup-Tabelle und Routing-Profile. Zusätzlich beschreibt BRouter eine Mapping-Schicht zwischen Routing-Modi und Routing- Profilen. Im öffentlichen BRouter-Profilverzeichnis finden sich u.a.:

| BRouter-Profil | Wanderer-Kategorie | Hinweise |
| --- | --- | --- |
| `trekking` | Bike / Touring | Balanciertes Fahrradprofil und häufiger Default für Alltags-/Touring-Routen. |
| `trekking-noferries` | Bike / Touring | Trekking-Variante ohne Fähren. |
| `trekking-nosteps` | Bike / Touring | Trekking-Variante ohne Stufen. |
| `trekking-steep` | Bike / Touring | Trekking-Variante mit anderer Hügelbehandlung. |
| `trekking-ignore-cr` | Bike / Touring | Trekking-Variante, die Cycle-Route-Präferenz ignoriert. |
| `fastbike` | Bike / Road | Schnelleres Fahrradprofil mit stärkerer Road-Speed-Orientierung. |
| `fastbike-lowtraffic` | Bike / Road | Schnelles Fahrradprofil mit stärkerer Low-Traffic-Präferenz. |
| `fastbike-verylowtraffic` | Bike / Road | Schnelles Fahrradprofil mit noch stärkerer Traffic-Vermeidung. |
| `gravel` | Bike / Gravel | Gravel-orientiertes Fahrradrouting. |
| `mtb` | Bike / MTB | Mountainbike-orientiertes Routing. |
| `shortest` | Foot / generisch | Kürzeste Route; als Baseline nützlich, aber nicht immer angenehm. |
| `hiking-mountain` | Foot / Hiking | Mountain-Hiking-Profil. |
| `moped` | Motor | Moped-/Scooter-ähnliches Routing. |
| `car-eco`, `car-fast`, `car-vario` | Motor | Auto-Varianten im öffentlichen Profilverzeichnis. |
| `skating` | Other | Skating-orientiertes Profil. |
| `rail`, `river`, `all`, `dummy`, `softaccess` | Spezial / Diagnose | Für Sonderfälle, Tests oder nicht-standardmäßiges Routing. |

Das BRouter-Plugin sollte eingebaute Profile und hochgeladene `.brf`-Dateien im gleichen konzeptionellen Slot behandeln: beides sind provider-native Profile. Standardnutzer wählen Wanderer-Intents; Advanced-Nutzer können native BRouter-Profile direkt wählen oder eigene `.brf`-Dateien hochladen.

### GraphHopper als Validierungsfall

GraphHopper ist für die Konzeptvalidierung wertvoll, auch wenn Valhalla und BRouter der primäre Implementierungsfokus bleiben. GraphHopper ist eine offene OSM-Routing-Engine, kann als Java-Library oder Standalone-Server laufen und bringt vordefinierte Profile wie `car`, `bike`, `racingbike`, `mtb`, `foot`, `hike`, `truck`, `bus` und `motorcycle` mit. Außerdem unterstützt GraphHopper Custom Models, mit denen Profile ohne Java-Code pro Request angepasst werden können.

Für Wanderer prüft GraphHopper drei wichtige Annahmen:

- Kanonische Wanderer-Intents lassen sich nicht nur auf Valhalla-Costings und BRouter-`.brf`, sondern auch auf ein weiteres Profil-/Custom-Model-Konzept mappen.
- Generische Preferences wie Road-/Surface-/Hill-Präferenz können als Custom-Model-Regeln oder Profil-Auswahl ausgedrückt werden, ohne dass Wanderer die GraphHopper-Sprache als globale Profilsprache übernimmt.
- Alternative Routen und Elevation existieren auch außerhalb von Valhalla, sodass die Capabilities `route.v1` und `elevation.v1` nicht Valhalla-spezifisch modelliert werden dürfen.

GraphHopper soll deshalb in Beispielen und der Validierungsmatrix als Validierungsengine auftauchen. Ein First-Party-GraphHopper-Plugin ist für den Zielzustand möglich, aber nicht notwendig, um den initialen Implementierungsfokus auf Valhalla und BRouter zu halten. Die exakten GraphHopper-Custom-Model- Mappings sind keine Voraussetzung für die Routing-Plugin-Spezifikation; sie werden erst relevant, wenn ein konkretes GraphHopper-Plugin gebaut wird.

## Kanonische Wanderer-Intents

Der Provider-Vergleich legt ein Schichtenmodell nahe:

1. Generischer `mode` für UI-Gruppierung und Kompatibilitätsprüfungen.
2. Kanonischer Wanderer-`intent` für Standardnutzer und Multi-Provider-Vergleich.
3. Plugin-Mapping von Wanderer-Intent zu provider-nativem Profil oder Config.
4. Optionales provider-natives Profil oder Config für Advanced-Nutzer.

Wanderer-Intents sind die gemeinsame Routing-Sprache der Anwendung. Provider-native Profile sind Plugin-Dialekte. Mappings sind das Wörterbuch dazwischen. Für Multi-Provider-Routing ist das zentral: BRouter `trekking` und Valhalla `bicycle` sind nur dann vergleichbar, wenn Wanderer weiß, dass beide auf denselben kanonischen Intent wie `bike_balanced` gemappt sind.

Vorgeschlagene generische Modes:

| Mode | Bedeutung |
| --- | --- |
| `foot` | Walking, Hiking, Running und Fußgängerzugang. |
| `bike` | Fahrrad-Routing jeder Art. |
| `motor` | Auto, Motorrad, Scooter, Truck und ähnliche Straßenfahrzeuge. |
| `mixed` | Route wechselt bewusst zwischen Modi. |
| `transit` | Public-Transport-aware Routing. |
| `other` | Spezialprofile wie Skating, Rail, River oder Diagnostik. |

Vorgeschlagene Standard-Intents:

| Intent | Mode | Label für Standardnutzer | Typisches Provider-Mapping |
| --- | --- | --- | --- |
| `walk` | `foot` | Walking | Valhalla `pedestrian`; BRouter `shortest` oder ein Walking-Profil, falls installiert. |
| `run` | `foot` | Laufen | Valhalla `pedestrian` mit höherer Geschwindigkeit und eher direktem Profil; BRouter Walking-/Hiking-Profil oder Custom-`.brf`; GraphHopper `foot` mit passendem Custom Model. |
| `hike` | `foot` | Wandern | Valhalla `pedestrian` Hiking-Preset; BRouter `hiking-mountain`. |
| `mountain_hike` | `foot` | Bergwandern | Valhalla `pedestrian` mit hoher Pfad-/Hügeltoleranz; BRouter `hiking-mountain` mit `SAC_scale_limit`/`SAC_scale_preferred`; GraphHopper `hike`. |
| `bike_balanced` | `bike` | Tourenrad | Valhalla `bicycle` Hybrid-Preset; BRouter `trekking`. |
| `bike_fast` | `bike` | Schnelles Rad | Valhalla `bicycle` Road-Preset; BRouter `fastbike`. |
| `bike_low_traffic` | `bike` | Ruhige Radroute | Valhalla `bicycle` mit Low-Road-Präferenz, soweit möglich; BRouter `fastbike-lowtraffic` oder `fastbike-verylowtraffic`. |
| `gravel` | `bike` | Gravel | Valhalla `bicycle` Cross-/Mountain-ähnliches Preset; BRouter `gravel`. |
| `mtb` | `bike` | Mountainbike | Valhalla `bicycle` Mountain-Preset; BRouter `mtb`. |
| `car` | `motor` | Auto | Valhalla `auto`; BRouter `car-fast` oder `car-vario`. |
| `scooter` | `motor` | Scooter / Moped | Valhalla `motor_scooter`; BRouter `moped`. |
| `motorcycle` | `motor` | Motorrad | Valhalla `motorcycle`; BRouter Custom-/Native-Profil, falls vorhanden. |

`run` überschneidet sich bewusst mit `walk` plus höherem `speedKmh`. Der eigene Intent ist als UI-Shortcut und semantische Nutzerabsicht gedacht: Laufen kann direktere Wege, andere Komfortannahmen und andere Default-Geschwindigkeiten bekommen, ohne dass Standardnutzer ein Walking-Profil manuell tunen müssen.

### Kanonische Routing-Präferenzen

Neben dem Intent braucht Wanderer weiterhin einfache Tuning-Optionen im Routenplaner. Diese Optionen sollten nicht provider-spezifisch sein, sondern als kleine, mode-spezifische `preferences` am Request hängen. Sie verändern den ausgewählten Intent, ersetzen ihn aber nicht.

Beispiel: `bike_balanced` beschreibt die grundlegende Absicht "Tourenrad". Die Preference `hillPreference: 0.2` sagt nur, dass dieser Tourenrad-Intent Hügel eher meiden soll. Ein anderer Provider darf daraus andere native Kostenfaktoren ableiten, solange die grobe Nutzerabsicht erhalten bleibt.

Für Standardnutzer sollten nur Preferences sichtbar sein, die für den gewählten Mode und die aktive Engine sinnvoll unterstützt werden. Bei Parallel-Routing ist eine Preference nur dann vergleichbar, wenn alle ausgewählten Engines dafür ein Mapping deklarieren. Andernfalls kann der Host die Option ausblenden, als nur teilweise unterstützt markieren oder in den provider-spezifischen Advanced-Bereich verschieben.

Die heutigen Editor-Slider sind damit keine Valhalla-Sonderfälle mehr, sondern werden größtenteils als kanonische Wanderer-Preferences modelliert. Sie bleiben im Standard-Editor sichtbar, wenn der Host sie für die aktive Engine oder die aktive Engine-Kombination als ausreichend unterstützt auflösen kann. Provider- spezifische Advanced Controls bleiben nur für Optionen übrig, die keine vergleichbare Wanderer-Semantik haben oder bewusst direkt in native Config schreiben.

Generische Preferences sollten bewusst klein bleiben:

| Preference | Typ | Modes | Bedeutung |
| --- | --- | --- | --- |
| `shortest` | boolean | alle | Kürzere Strecke stärker gewichten als Komfort, Geschwindigkeit oder Qualität. |
| `speedKmh` | number | `foot`, `bike` | Angenommene Bewegungs-/Reisegeschwindigkeit für Dauer und Kostenmodell. |
| `hillPreference` | number `0..1` | `foot`, `bike` | `0` meidet Steigungen stark, `0.5` ist neutral, `1` akzeptiert oder bevorzugt hügelige Wege stärker. |
| `maxHikingDifficulty` | enum oder number | `foot` | Maximale akzeptierte Wander-/SAC-Schwierigkeit. |
| `bicycleType` | enum | `bike` | Fahrradtyp, z.B. `road`, `hybrid`, `city`, `cross`, `mountain`. |
| `roadPreference` | number `0..1` | `bike` | `0` meidet Straßen stärker, `1` nutzt Straßen stärker. |
| `avoidBadSurfaces` | number `0..1` | `bike` | Höhere Werte meiden schlechte oder unbekannte Oberflächen stärker. |
| `fixedSpeedKmh` | number | `motor` | Feste Geschwindigkeit für Zeit-/Kostenmodell, unabhängig von Straßentypen. |
| `topSpeedKmh` | number | `motor` | Maximale Fahrzeuggeschwindigkeit. |
| `vehicleWidthM` | number | `motor` | Fahrzeugbreite für Routing mit Breitenbeschränkungen. |
| `vehicleHeightM` | number | `motor` | Fahrzeughöhe für Routing mit Höhenbeschränkungen. |

Diese Liste deckt die aktuellen Editor-Optionen ab:

| Aktueller Mode | Aktuelle Option | Kanonische Preference |
| --- | --- | --- |
| Auto | fixe Geschwindigkeit | `fixedSpeedKmh` |
| Auto | Höchstgeschwindigkeit | `topSpeedKmh` |
| Auto | Autobreite | `vehicleWidthM` |
| Auto | Autohöhe | `vehicleHeightM` |
| Wandern | Laufgeschwindigkeit | `speedKmh` |
| Wandern | Hügel einbeziehen | `hillPreference` |
| Wandern | maximale Schwierigkeit der Wanderung | `maxHikingDifficulty` |
| Radfahren | Fahrradtyp | `bicycleType` |
| Radfahren | Radfahrgeschwindigkeit | `speedKmh` |
| Radfahren | Hügel einbeziehen | `hillPreference` |
| Radfahren | Nutze Straßen | `roadPreference` |
| Radfahren | Vermeide schlechte Oberflächen | `avoidBadSurfaces` |
| alle Auto-Routing-Modes | shortest | `shortest` |

Vorgeschlagene Provider-Mappings:

| Preference | Valhalla | BRouter | GraphHopper |
| --- | --- | --- | --- |
| `shortest` | `shortest` in `costing_options`. | Eigenes Profil oder `.brf`-Template mit stärkerer Distanzgewichtung; ggf. natives `shortest` für Foot. | Kürzere Route über Custom Model / Gewichtung oder alternatives Profil, wenn unterstützt. |
| `speedKmh` | `walking_speed` für `pedestrian`, `cycling_speed` für `bicycle`. | Dynamisches `.brf` aus Template; je nach Profil über Variablen wie `maxSpeed`, `bikerPower`, `totalMass` oder eigene Zeitkosten. | Custom Model kann Geschwindigkeiten beeinflussen; einfache Dauerannahmen ggf. host-seitig oder provider-spezifisch. |
| `hillPreference` | `use_hills` für `pedestrian` und `bicycle`. | `.brf`-Template über `consider_elevation`, `uphillcost`, `downhillcost` und Cutoff-Werte. | Custom Model mit Elevation-/Steigungsdaten, sofern Profil/Server diese Encoded Values bereitstellt. |
| `maxHikingDifficulty` | `max_hiking_difficulty` im `pedestrian`-Costing. | `.brf`-Template über `SAC_scale_limit` und `SAC_scale_preferred`. | `hike`-Profil oder Custom Model, sofern SAC-/Trail-Schwierigkeitsdaten verfügbar sind. |
| `bicycleType` | `bicycle_type`: `Road`, `Hybrid`, `City`, `Cross`, `Mountain`. | Auswahl eines nativen Profils wie `fastbike`, `trekking`, `gravel`, `mtb` oder passendes `.brf`-Template. | Profilauswahl wie `bike`, `racingbike`, `mtb` plus Custom Model. |
| `roadPreference` | `use_roads` im `bicycle`-Costing. | `.brf`-Template mit angepassten Kosten für Straßenklassen, Cycleways, Tracks und Traffic-Variablen. | Custom Model über Road-Class-/Road-Environment-Regeln. |
| `avoidBadSurfaces` | `avoid_bad_surfaces` im `bicycle`-Costing. | `.brf`-Template mit Surface-/Smoothness-Kosten. | Custom Model über `surface`, `smoothness` oder vergleichbare Encoded Values. |
| `fixedSpeedKmh` | `fixed_speed` im `auto`-Costing. | Möglich über Auto-`.brf`-Template und eigene Zeit-/Kostenberechnung; nicht als universelles Built-in garantiert. | Custom Model oder provider-spezifisches Profil, abhängig vom Serverprofil. |
| `topSpeedKmh` | `top_speed` im `auto`-Costing. | Auto-Profile wie `car-vario` können Geschwindigkeit über Variablen wie `vmax` abbilden. | Custom Model kann Geschwindigkeit begrenzen, wenn das Profil dies zulässt. |
| `vehicleWidthM` | `width` im `auto`-/fahrzeugbezogenen Costing. | Nur möglich, wenn Daten und `.brf`-Profil Breitenbeschränkungen explizit auswerten; kein garantierter Standard. | Eher Truck-/Vehicle-Profil oder Custom Model, abhängig von aktivierten Encoded Values. |
| `vehicleHeightM` | `height` im `auto`-/fahrzeugbezogenen Costing. | Nur möglich, wenn Daten und `.brf`-Profil Höhenbeschränkungen explizit auswerten; kein garantierter Standard. | Eher Truck-/Vehicle-Profil oder Custom Model, abhängig von aktivierten Encoded Values. |

BRouter ist dabei der wichtigste Sonderfall: Viele Preferences sind nicht Parameter eines stabilen HTTP-Formats, sondern Teil der `.brf`-Cost-Function. Das BRouter-Plugin kann deshalb zwei Wege anbieten:

- feste native Profile wie `trekking`, `fastbike`, `gravel`, `mtb`, `hiking-mountain`, `car-fast` oder `car-vario`;
- generierte User-Profile aus sicheren `.brf`-Templates, bei denen Wanderer- Preferences in begrenzte Platzhalter eingesetzt werden.

Template-basierte `.brf`-Generierung ist provider-spezifisch und bleibt im BRouter-Plugin. Der Host speichert nur das resultierende native Profil oder die Template-Parameter, validiert Größe und Herkunft und gibt sie begrenzt an das Plugin weiter. Wanderer selbst wird dadurch nicht zur BRouter-Profilengine.

Diese Taxonomie ist autoritativ für Vergleichbarkeit, aber erweiterbar. Wanderer sollte eine kleine Default-Liste für normale Nutzer mitbringen. Admins können instanzweite Intents wie `bike_commute` oder `trail_run` ergänzen. Nutzer können persönliche Varianten oder Aliase anlegen, dürfen aber die globale Bedeutung eines Admin-Intents nicht still überschreiben.

Ein Custom-Intent ohne Mapping auf zwei oder mehr ausgewählte Engines ist für Single-Engine-Routing gültig, aber nicht providerübergreifend vergleichbar. Parallelvergleich ist nur für Engines definiert, die auf denselben kanonischen Intent-Key gemappt sind.

Plugins deklarieren, welche Modes und Intents sie bedienen können, und liefern Mapping-Vorschläge von generischen Intents zu nativen Profilen. Der Host kann damit eine einfache Standard-UI zeigen und Advanced-Nutzern trotzdem native Provider-Profile direkt zugänglich machen.

### Ownership und Mappings

Empfohlenes Ownership-Modell:

| Ebene | Owner | Zweck |
| --- | --- | --- |
| Eingebaute Wanderer-Intents | Wanderer | Stabile Defaults wie `hike`, `bike_balanced`, `gravel` und `car`. |
| Custom Global Intents | Admin | Instanzweite Ergänzungen mit geteilter Semantik, z.B. `bike_commute`. |
| Persönliche Intents oder Aliase | User | User-spezifische Varianten, die Mappings für diesen User überschreiben können. |
| Native Plugin-Profile | Plugin / Provider | Provider-Built-ins wie BRouter `trekking` oder Valhalla `pedestrian`. |
| Hochgeladene native Profile | User | Provider-native Custom-Dateien wie eine BRouter-`.brf`. |
| Profil-Mappings | Admin und User | Übersetzen Wanderer-Intents in native Plugin-Profile oder Config. |

Plugin-deklarierte Profile sind nützlich für Discovery und Mapping-Vorschläge, sollten aber nicht die primäre Vergleichsebene sein. Wenn Plugins nur eigene Profile melden, müsste Wanderer raten, ob Namen wie `trekking`, `hybrid`, `touring`, `bike`, `road_bike` und `fastbike-lowtraffic` äquivalent sind. Diese Raterei wird instabil, sobald mehrere Provider parallel angefragt werden.

Der Host löst Routing-Anfragen in dieser Reihenfolge auf:

1. User-selected Wanderer-Intent, z.B. `bike_balanced`.
2. User-spezifisches Mapping für das ausgewählte Plugin, falls vorhanden.
3. Admin-Mapping für das ausgewählte Plugin, falls vorhanden.
4. Plugin-vorgeschlagenes Default-Mapping aus Manifest-Metadata.
5. Strukturierter Fehler, wenn kein Mapping existiert.

Beispiele:

| Wanderer-Intent | BRouter-Mapping | Valhalla-Mapping |
| --- | --- | --- |
| `bike_balanced` | Native profile `trekking` | `costing: "bicycle"` mit Hybrid-/Touring-Optionen. |
| `bike_commute` | User-uploaded `commute.brf` oder native `fastbike-lowtraffic` | `costing: "bicycle"` mit Low-Road- und Avoid-Highway-Präferenzen. |
| `hike` | Native profile `hiking-mountain` | `costing: "pedestrian"` mit Hiking-Preset. |
| `car` | Native profile `car-fast` oder `car-vario` | `costing: "auto"`. |

Die Standard-UI sollte einfach bleiben: Intent wählen und routen. Advanced- Einstellungen können das aufgelöste native Mapping anzeigen und Admins oder Usern erlauben, es zu überschreiben.

### Discovery-Vertrag

Routing-Plugins deklarieren ihre Routing-Fähigkeiten über `metadata.routing`. Diese Discovery-Daten sind der maschinenlesbare Vertrag, mit dem der Host Mappings vorschlagen, Preferences prüfen und die UI auf unterstützte Controls begrenzen kann.

Vorgeschlagene Metadata-Struktur:

```json
{
  "metadata": {
    "routing": {
      "version": "v1",
      "roles": ["route", "elevation"],
      "modes": ["foot", "bike", "motor"],
      "supportsSegmentGeometry": true,
      "supportsShapeRanges": false,
      "supportsAlternatives": true,
      "maxAlternatives": 3,
      "supportsRouteElevation": true,
      "supportsElevation": true,
      "intents": {
        "bike_balanced": {
          "defaultProfile": "trekking",
          "nativeProfiles": ["trekking", "trekking-noferries", "trekking-nosteps"],
          "preferences": {
            "speedKmh": {
              "support": "template",
              "min": 3,
              "max": 45,
              "default": 18
            },
            "hillPreference": {
              "support": "template",
              "min": 0,
              "max": 1,
              "default": 0.5
            },
            "roadPreference": {
              "support": "template",
              "min": 0,
              "max": 1,
              "default": 0.5
            },
            "avoidBadSurfaces": {
              "support": "template",
              "min": 0,
              "max": 1,
              "default": 0.25
            },
            "shortest": {
              "support": "partial",
              "default": false
            }
          },
          "requiredPreferences": []
        },
        "bike_fast": {
          "defaultProfile": "fastbike",
          "nativeProfiles": ["fastbike", "fastbike-lowtraffic", "fastbike-verylowtraffic"],
          "preferences": {
            "speedKmh": {
              "support": "template",
              "min": 3,
              "max": 60,
              "default": 25
            },
            "roadPreference": {
              "support": "template",
              "min": 0,
              "max": 1,
              "default": 0.75
            }
          },
          "requiredPreferences": []
        }
      },
      "nativeProfiles": [
        {
          "key": "trekking",
          "label": "Trekking",
          "mode": "bike",
          "intents": ["bike_balanced"],
          "advanced": false
        },
        {
          "key": "fastbike-lowtraffic",
          "label": "Fast bike low traffic",
          "mode": "bike",
          "intents": ["bike_fast", "bike_low_traffic"],
          "advanced": true
        }
      ],
      "nativeProfileUpload": {
        "enabled": true,
        "extensions": [".brf"],
        "contentTypes": ["text/plain"],
        "maxBytes": 65536
      }
    }
  }
}
```

Feldsemantik:

| Feld | Bedeutung |
| --- | --- |
| `version` | Version des Discovery-Vertrags, zunächst `v1`. |
| `roles` | Rollen des Plugins: `route`, `elevation` oder beide. |
| `modes` | Grobe Wanderer-Modes, die das Plugin bedienen kann. |
| `supportsSegmentGeometry` | Plugin kann pro Anchor-Paar eigene Segment-Geometrien liefern. |
| `supportsShapeRanges` | Plugin kann Full-Shape plus Segment-Indexbereiche liefern. |
| `supportsAlternatives` | Plugin kann mehrere native Routenkandidaten liefern. |
| `maxAlternatives` | Obergrenze sinnvoller nativer Alternativen pro Plugin-Invocation. |
| `supportsRouteElevation` | `route.v1` kann bereits brauchbare Höhen enthalten. |
| `supportsElevation` | Plugin implementiert separate `elevation.v1`-Capability. |
| `intents` | Plugin-vorgeschlagene Mappings von Wanderer-Intents auf native Profile und Preferences. |
| `nativeProfiles` | Provider-native Profile, die der Host listen und Advanced-Nutzern anbieten kann. |
| `nativeProfileUpload` | Upload-Vertrag für provider-native Profil-Dateien. |

`preferences` beschreibt pro Intent, welche kanonischen Wanderer-Preferences das Plugin sinnvoll verarbeiten kann. Der Host nutzt diese Daten, um UI-Regler anzuzeigen, Parallelvergleich zu prüfen und `unsupported_preference` korrekt als Warning oder Fehler einzuordnen.

Support-Werte:

| Wert | Bedeutung |
| --- | --- |
| `full` | Preference wird direkt und verlässlich in native Provider-Optionen gemappt. |
| `partial` | Preference hat eine grobe oder eingeschränkte Entsprechung. |
| `template` | Preference ist über ein provider-spezifisches Template abbildbar, z.B. BRouter-`.brf`. |
| `advanced` | Preference ist nur über native Advanced-Konfiguration verfügbar. |
| `unsupported` | Preference wird für diesen Intent nicht unterstützt. |

`requiredPreferences` sollte selten verwendet werden. Es markiert Preferences, die für ein Mapping nicht ignoriert werden dürfen. Wenn eine solche Preference nicht angewendet werden kann, wird `unsupported_preference` engine-fatal.

Für Valhalla wäre `nativeProfileUpload.enabled` `false`; Advanced-Nutzer würden provider-spezifische Profil-/Config-Felder bearbeiten. Für BRouter ist Upload ein Kernfeature.

## Host-API

Das Frontend ruft ausschließlich plugin-neutrale Endpunkte auf:

| Endpoint | Zweck |
| --- | --- |
| `GET /api/v1/plugins/routing/engines` | Aktivierte Routing-Plugin-Instanzen und deren Capabilities für den User auflisten. |
| `POST /api/v1/plugins/routing/route` | Routenkandidaten von einer oder mehreren Routing-Engines anfragen. |
| `POST /api/v1/plugins/routing/elevation` | Höheninformationen über ein ausgewähltes Elevation-Plugin korrigieren oder ergänzen. |
| `GET /api/v1/plugins/routing/profiles` | User-Profile und eingebaute Plugin-Profile auflisten. |
| `POST /api/v1/plugins/routing/profiles` | User-Routing-Profil erstellen oder hochladen. |
| `PATCH /api/v1/plugins/routing/profiles/{id}` | User-Profil umbenennen, ersetzen oder deaktivieren. |
| `DELETE /api/v1/plugins/routing/profiles/{id}` | User-Profil löschen. |
| `GET /api/v1/plugins/routing/intents` | Eingebaute, admin-definierte und user-definierte Wanderer-Intents auflisten. |
| `POST /api/v1/plugins/routing/intents` | Admin- oder User-Intent erstellen. |
| `GET/PATCH /api/v1/plugins/routing/mappings` | Intent-zu-Plugin-Mappings lesen oder aktualisieren. |
| `GET/PATCH /api/v1/plugins/routing/settings` | User-Routing-Defaults lesen oder aktualisieren. |

### Discovery, Settings und Controls

`GET /api/v1/plugins/routing/engines` liefert Raw Discovery für aktivierte Routing-Plugin-Instanzen. Diese Daten sind für Admin-/Advanced-UI, Debugging und Mapping-Konfiguration gedacht; das Frontend muss daraus keine effektiven Standard-Controls berechnen.

```json
{
  "engines": [
    {
      "pluginId": "brouter",
      "instanceId": "abc123",
      "name": "BRouter",
      "enabled": true,
      "roles": ["route"],
      "modes": ["foot", "bike", "motor"],
      "metadata": {
        "routing": {}
      }
    },
    {
      "pluginId": "valhalla",
      "instanceId": "def456",
      "name": "Valhalla",
      "enabled": true,
      "roles": ["route", "elevation"],
      "modes": ["foot", "bike", "motor"],
      "metadata": {
        "routing": {}
      }
    }
  ]
}
```

`GET /api/v1/plugins/routing/settings` und `PATCH /api/v1/plugins/routing/settings` lesen oder ändern User-Defaults:

```json
{
  "primaryRouteInstance": "abc123",
  "elevationInstance": "def456",
  "compareInstances": ["abc123", "def456"],
  "defaultIntent": "hike",
  "defaultVariantCount": 3,
  "defaultPreferences": {
    "hillPreference": 0.5
  }
}
```

Effektive Editor-Controls werden über einen eigenen Resolver aufgelöst:

```text
POST /api/v1/plugins/routing/effective-controls
```

Request:

```json
{
  "intent": "gravel",
  "routing": {
    "mode": "parallel",
    "engines": [
      { "pluginId": "brouter", "instanceId": "abc123" },
      { "pluginId": "valhalla", "instanceId": "def456" }
    ]
  }
}
```

Response:

```json
{
  "intent": "gravel",
  "mode": "bike",
  "controls": [
    {
      "key": "speedKmh",
      "type": "number",
      "ui": "slider",
      "min": 3,
      "max": 60,
      "default": 20,
      "support": "partial",
      "comparable": true
    },
    {
      "key": "avoidBadSurfaces",
      "type": "number",
      "ui": "slider",
      "min": 0,
      "max": 1,
      "default": 0.25,
      "support": "template",
      "comparable": true
    }
  ],
  "hiddenControls": [
    {
      "key": "vehicleHeightM",
      "reason": "unsupported_for_mode"
    }
  ],
  "warnings": []
}
```

Der Host berechnet die Schnittmenge und Vergleichbarkeit der Preferences. `comparable: true` gilt nur, wenn alle ausgewählten Engines die Preference mindestens `partial` unterstützen. `advanced` und `unsupported` erscheinen nicht in den Standard-Controls. Das Frontend rendert nur die Controls, die der Host zurückgibt.

`GET /api/v1/plugins/routing/profiles` gibt Discovery-Built-ins und gespeicherte User-/Generated-Profile gemeinsam zurück:

```json
{
  "profiles": [
    {
      "id": null,
      "pluginId": "brouter",
      "key": "trekking",
      "name": "Trekking",
      "kind": "builtin",
      "mode": "bike",
      "source": "discovery"
    },
    {
      "id": "profile_123",
      "pluginId": "brouter",
      "key": "my-gravel",
      "name": "My Gravel",
      "kind": "custom_file",
      "mode": "bike",
      "source": "user"
    }
  ]
}
```

`POST`, `PATCH` und `DELETE` auf `/profiles` verwalten nur gespeicherte User-/Generated-Profile, keine Discovery-Built-ins. Mappings werden über `GET/PATCH /api/v1/plugins/routing/mappings` gelesen oder aktualisiert und sind primär für Admin- und Advanced-UI relevant, nicht für den normalen Editor-Flow.

Der Route-Endpunkt unterstützt Single-Engine- und Multi-Engine-Calls:

```json
{
  "routing": {
    "mode": "single",
    "intent": "bike_balanced",
    "engine": {
      "pluginId": "brouter",
      "instanceId": "abc123",
      "profileId": "trekking"
    }
  },
  "elevation": {
    "pluginId": "valhalla",
    "instanceId": "def456"
  },
  "anchors": [
    { "lat": 47.3769, "lon": 8.5417 },
    { "lat": 47.3850, "lon": 8.5600 }
  ],
  "options": {
    "includeElevation": true,
    "desiredVariants": 3
  }
}
```

Für parallele Vorschläge:

```json
{
  "routing": {
    "mode": "parallel",
    "intent": "bike_balanced",
    "engines": [
      {
        "pluginId": "brouter",
        "instanceId": "abc123",
        "profileId": "trekking"
      },
      {
        "pluginId": "valhalla",
        "instanceId": "def456",
        "profileId": "touring_bike"
      }
    ]
  },
  "anchors": [
    { "lat": 47.3769, "lon": 8.5417 },
    { "lat": 47.3850, "lon": 8.5600 }
  ],
  "options": {
    "includeElevation": true,
    "desiredVariants": 3
  }
}
```

Im `parallel`-Mode steht der Intent bewusst auf der obersten Ebene. Alle ausgewählten Engines beantworten dieselbe Wanderer-Absicht; pro Engine darf nur das native Mapping oder `profileId` überschrieben werden. Wenn ein Nutzer eine Gravel-Tour plant, soll Wanderer also keine Rennrad-Route als Vergleich danebenlegen. Gemischte Intents können als separate freie Variantenansicht denkbar sein, gehören aber nicht zum vergleichbaren Parallel-Routing.

Der Host darf Plugin-Calls parallel ausführen. Jede Plugin-Invocation nutzt weiterhin die bestehende Worker-Isolation und Timeout-Policy.

### Host-Route-Request

`POST /api/v1/plugins/routing/route` ist der stabile Vertrag zwischen Frontend und Host. Der Host löst daraus Plugin-Instanzen, Intent-Mappings, native Profile und Plugin-Inputs auf.

```json
{
  "routing": {
    "mode": "single",
    "intent": "bike_balanced",
    "engine": {
      "pluginId": "brouter",
      "instanceId": "abc123",
      "profileId": "trekking"
    }
  },
  "elevation": {
    "pluginId": "valhalla",
    "instanceId": "def456"
  },
  "anchors": [
    { "lat": 47.3769, "lon": 8.5417 },
    { "lat": 47.3850, "lon": 8.5600 }
  ],
  "preferences": {
    "speedKmh": 18,
    "hillPreference": 0.5,
    "roadPreference": 0.5,
    "avoidBadSurfaces": 0.25,
    "shortest": false
  },
  "requiredPreferences": [],
  "options": {
    "includeElevation": true,
    "desiredVariants": 3,
    "language": "de"
  }
}
```

Pflichtfelder:

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `routing.mode` | ja | `single` oder `parallel`. |
| `routing.intent` | ja | Kanonischer Wanderer-Intent. |
| `routing.engine` | ja bei `single` | Eine Engine-Auswahl. |
| `routing.engines` | ja bei `parallel` | Eine oder mehrere Engine-Auswahlen für denselben Intent. |
| `anchors` | ja | Mindestens zwei Punkte. |
| `anchors[].lat` / `anchors[].lon` | ja | WGS84-Koordinaten. |
| `preferences` | nein | Kanonische Tuning-Optionen. |
| `requiredPreferences` | nein | Preferences, die nicht ignoriert werden dürfen. |
| `elevation` | nein | Gewünschte Elevation-Engine; sonst User-Default oder keine Elevation. |
| `options` | nein | Host-Optionen für Varianten, Sprache und Elevation. |

Defaults:

| Feld | Default |
| --- | --- |
| `options.includeElevation` | `true`, weil heutiges Verhalten Höhen nachzieht und Höhengewinn/-verlust für Kandidatenauswahl relevant sind. |
| `options.desiredVariants` | User-Setting `default_variant_count`, sonst `1`. |
| `options.language` | User- oder Browser-Sprache, sonst `en`. |
| `preferences` | Intent-/Profil-Defaults aus Mapping und Plugin-Discovery. |
| `requiredPreferences` | `[]`. |
| `elevation` | User-Default `elevation_instance`, falls gesetzt. |

Start-Limits:

| Limit | Wert |
| --- | --- |
| Anchors | min. `2`, max. `100` |
| `desiredVariants` | min. `1`, max. `5` |
| Engines pro Parallel-Request | max. `5` |
| Decodierte Punkte pro Kandidat | max. `20000` |
| Request-Timeout pro Engine | `8000ms` |
| Gesamt-Orchestrierung-Timeout | `15000ms` |

Parallele Requests haben Teilfehler-Semantik. Der Host gibt erfolgreiche Kandidaten von Engines zurück, die abgeschlossen haben, und hängt strukturierte per-Engine-Fehler für fehlgeschlagene Engines an. Timeout, Rate-Limit, fehlendes Mapping, ungültiges Profil oder temporärer Provider-Ausfall dürfen gültige Kandidaten anderer Engines nicht verwerfen. Ein vollständiger Request-Fehler entsteht nur, wenn keine ausgewählte Engine einen brauchbaren Kandidaten liefern kann oder die Anfrage selbst ungültig ist.

`desiredVariants` gilt modusunabhängig. Im Single-Engine-Modus übersetzt der Host die gewünschte finale Variantenzahl in eine provider-spezifische Alternativen-Anfrage an diese eine Engine. Im Parallel-Modus kombiniert er Alternativen innerhalb einer Engine mit mehreren Engines für denselben Intent. Der Host muss Kandidaten beim Aggregieren eindeutig namespacen, z.B. über `pluginId`, `instanceId`, `profileKey` und die native Kandidaten-ID. Zwei Plugins dürfen intern beide `"primary"` liefern; in der Frontend-Antwort muss daraus eine stabile, host-seitig eindeutige Kandidaten-ID werden.

Die UI sollte Nutzer nicht mit "Alternativen pro Engine" belasten. Sie wählt stattdessen die gewünschte finale Anzahl sichtbarer Varianten, z.B. `desiredVariants: 3`. Der Host übersetzt diese Zahl in provider-spezifische Requests. Er darf pro Engine bis zu einer kleinen Reserve an Kandidaten anfragen, begrenzt durch Plugin-Metadata wie `maxAlternatives`, Rate-Limits und User-Policy. Die finale Antwort enthält höchstens `desiredVariants` sichtbare Kandidaten, sofern genug brauchbare Varianten existieren.

`desiredVariants` ist dabei ein Zielwert, kein Versprechen, dass jeder Request immer mehrere Varianten auslöst. Der Host darf die effektive Variantenzahl abhängig vom Abstand der Anker, vom Routing-Kontext und von Rate-Limits reduzieren. Für sehr kurze Segmente, z.B. wenige hundert Meter einer Radtour, sind mehrere Vorschläge oft nicht hilfreich; für lange Segmente oder ganze Touren über viele Kilometer können Varianten dagegen großen Mehrwert haben. Diese Heuristik gehört zur Host-Policy und kann später über User-Settings oder Admin-Limits justiert werden.

Die Auswahl sollte nicht rein nach maximaler Abweichung erfolgen. Sonst gewinnen exotische Umwege, nur weil sie anders sind. Der Host sollte zuerst ungültige, segmentinkompatible, stark gewarnte oder extrem schlechte Kandidaten filtern und danach innerhalb eines Qualitätskorridors auf Diversität optimieren:

1. gleicher kanonischer Intent als harte Pflicht;
2. gültige Segmentstruktur und policy-konforme Geometrie;
3. akzeptable Qualität nach Distanz, Dauer, Höhengewinn/-verlust und Warnings;
4. ausreichend andere Linienführung gegenüber bereits gewählten Kandidaten;
5. optional Provider-Balance, damit nicht alle Slots von derselben Engine belegt werden, wenn vergleichbar gute Alternativen existieren.

Oberflächen-, Wegtyp- oder Qualitäts-Breakdowns können zukünftig als optionale normalisierte Kandidaten-Metadaten ergänzt werden. Sie sollten aber nicht stillschweigend als Host-Selektor vorausgesetzt werden, solange der Route-Output-Vertrag sie nicht liefert.

Eine mögliche Heuristik: Der Host nimmt zunächst den besten Kandidaten und ergänzt danach Kandidaten, die genug geometrische Varianz bringen, ohne den Qualitätskorridor deutlich zu verlassen. Dadurch können BRouter und Valhalla echte Alternativen liefern, ohne dass eine absichtlich schlechte Route nur wegen hoher Varianz sichtbar wird.

Elevation wird bei Mehrvarianten-Requests nicht für alle rohen Kandidaten berechnet, ist aber ranking-relevant. Wenn `includeElevation` gesetzt ist, nutzt der Host zunächst Höhenwerte, die eine Routing-Engine bereits mitliefert. Fehlen brauchbare Höhen, ergänzt der Host Elevation vor der finalen Auswahl für eine begrenzte, bereits vorgefilterte Shortlist. Dadurch können Höhengewinn und Höhenverlust in die Kandidatenauswahl einfließen, ohne dass jeder rohe Provider-Kandidat einen Elevation-Call erzeugt. Die Shortlist-Größe wird durch Host-Policy, Rate-Limits und `desiredVariants` begrenzt.

### Host-Route-Response

`POST /api/v1/plugins/routing/route` gibt eine final kuratierte Kandidatenliste für den Editor zurück. Die Response ist host-owned: Plugin-Kandidaten werden validiert, eindeutig benannt, optional mit Elevation angereichert und mit Teilfehlern zusammengeführt.

```json
{
  "requestId": "route_req_123",
  "intent": "bike_balanced",
  "mode": "bike",
  "candidates": [
    {
      "id": "cand_brouter_abc123_trekking_primary",
      "label": "BRouter · Trekking",
      "provider": {
        "pluginId": "brouter",
        "instanceId": "abc123",
        "name": "BRouter",
        "profileKey": "trekking",
        "nativeCandidateId": "primary"
      },
      "geometry": {
        "format": "encoded_polyline",
        "precision": 6,
        "coordinates": "..."
      },
      "summary": {
        "distance": 1234.5,
        "duration": 987,
        "elevationGain": 120.0,
        "elevationLoss": 118.0
      },
      "segments": [
        {
          "fromAnchor": 0,
          "toAnchor": 1,
          "geometry": {
            "format": "encoded_polyline",
            "precision": 6,
            "coordinates": "..."
          },
          "distance": 1234.5,
          "duration": 987
        }
      ],
      "elevation": {
        "status": "complete",
        "provider": {
          "pluginId": "valhalla",
          "instanceId": "def456"
        }
      },
      "warnings": []
    }
  ],
  "engineErrors": [
    {
      "pluginId": "valhalla",
      "instanceId": "def456",
      "code": "provider_timeout",
      "message": "Valhalla did not respond before timeout."
    }
  ],
  "warnings": []
}
```

Festlegungen:

- `candidates` enthält höchstens `desiredVariants` Kandidaten.
- `candidate.id` wird immer vom Host erzeugt und ist innerhalb der Response eindeutig und stabil.
- `provider.nativeCandidateId` ist optional und stammt aus dem Plugin-Output.
- `engineErrors` enthält Teilfehler einzelner Engines oder Instanzen. Diese Fehler verwerfen erfolgreiche Kandidaten anderer Engines nicht.
- Ein HTTP-Fehler entsteht nur, wenn der Request selbst ungültig ist oder kein nutzbarer Kandidat erzeugt werden konnte.
- `warnings` auf Response-Ebene betreffen die Gesamtanfrage; `warnings` auf Kandidatenebene betreffen nur diesen Kandidaten.

Kanonische `candidate.elevation.status`-Werte:

| Status | Bedeutung |
| --- | --- |
| `none` | Keine Höhen angefragt oder keine Höhen vorhanden. |
| `included` | Die Routing-Engine hat bereits brauchbare Höhen mitgeliefert. |
| `complete` | Der Host hat Höhen über `elevation.v1` vollständig ergänzt oder korrigiert. |
| `partial` | Nur ein Teil der Punkte hat gültige Höhen; der Host hat punktweise Fallbacks angewendet. |
| `pending` | Elevation wurde noch nicht berechnet, kann aber lazy für diesen Kandidaten nachgeladen werden. |
| `failed` | Elevation wurde angefragt, ist aber fehlgeschlagen; Geometrie bleibt nutzbar. |

`complete`, `partial` und `failed` entstehen aus einem `elevation.v1`-Call. `included` entsteht, wenn die Routing-Engine bereits brauchbare Höhen liefert. `none` und `pending` sind Host-Zustände ohne abgeschlossenen Elevation-Call.

### Error-Code-Modell

Routing-Fehler werden als maschinenlesbare Codes modelliert. `message` ist für Anzeige und Debugging gedacht. `detail` darf begrenzte, host-gefilterte Zusatzinformationen enthalten, aber keinen ungeprüften Provider-Rohdump.

```json
{
  "pluginId": "valhalla",
  "instanceId": "def456",
  "code": "provider_timeout",
  "message": "Valhalla did not respond before timeout.",
  "detail": {
    "timeoutMs": 8000
  }
}
```

Vorgeschlagene Codes:

| Code | Bedeutung | Wirkung |
| --- | --- | --- |
| `mapping_missing` | Für Intent und Plugin existiert kein Mapping. | Engine-fatal |
| `profile_missing` | Referenziertes Profil existiert nicht oder ist deaktiviert. | Engine-fatal |
| `profile_invalid` | Profilinhalt ist ungültig oder vom Plugin nicht verarbeitbar. | Engine-fatal |
| `unsupported_intent` | Plugin unterstützt den gewählten Intent grundsätzlich nicht. | Engine-fatal |
| `unsupported_preference` | Preference kann nicht angewendet werden. | Warning oder Engine-fatal |
| `provider_timeout` | Provider-, Connector- oder Plugin-Aufruf überschreitet Timeout. | Engine-fatal |
| `provider_rate_limited` | Provider oder Host-Policy limitiert die Anfrage. | Engine-fatal |
| `provider_unavailable` | Provider antwortet nicht oder liefert temporären Fehler. | Engine-fatal |
| `connector_denied` | Plugin versucht nicht erlaubten Connector oder Pfad zu nutzen. | Engine-fatal, Security-relevant |
| `response_too_large` | Provider- oder Plugin-Response überschreitet Host-Limits. | Engine-fatal |
| `candidate_invalid` | Kandidat kann nicht normalisiert werden. | Kandidat-fatal |
| `candidate_segment_mismatch` | Segmente passen nicht zu den angefragten Anchor-Paaren. | Kandidat-fatal |
| `candidate_geometry_invalid` | Polyline oder Shape ist kaputt, leer oder nicht decodierbar. | Kandidat-fatal |
| `candidate_policy_violation` | Kandidat verletzt Host-Limits, z.B. zu viele Punkte. | Kandidat-fatal |
| `elevation_failed` | Elevation konnte nicht berechnet werden. | Nicht route-fatal |
| `elevation_partial` | Elevation ist nur teilweise verfügbar. | Warning |
| `internal_error` | Unerwarteter Host- oder Plugin-Fehler. | Engine-fatal |

Fehlerklassen:

- Request-fatal: Der Client-Request ist ungültig oder am Ende bleibt kein nutzbarer Kandidat übrig. Der Host antwortet mit HTTP-Fehler.
- Engine-fatal: Eine Engine-Invocation ist für diesen Request unbrauchbar. Der Fehler landet in `engineErrors`; erfolgreiche Kandidaten anderer Engines bleiben erhalten.
- Kandidat-fatal: Ein einzelner Kandidat wird verworfen. Wenn dadurch alle Kandidaten einer Engine wegfallen, erzeugt der Host einen Engine-Fehler.
- Warning: Response oder Kandidat bleibt nutzbar.

`unsupported_preference` ist standardmäßig eine Warning: Das Plugin ignoriert die Preference und dokumentiert dies in `warnings`. Fatal wird der Fehler nur, wenn der Host die Preference als verpflichtend markiert hat, z.B. über `requiredPreferences`, oder wenn sie für einen bestimmten Vergleich zwingend ist.

HTTP-Status der Host-Endpunkte:

| Status | Situation |
| --- | --- |
| `200` | Mindestens ein nutzbarer Kandidat wurde erzeugt. Teilfehler einzelner Engines stehen in `engineErrors`. |
| `400` | Request ist syntaktisch oder strukturell ungültig, z.B. kaputtes JSON, ungültige Koordinaten, zu wenige Anchors oder `desiredVariants` außerhalb der Limits. |
| `401` | User ist nicht authentifiziert. |
| `403` | User darf die angefragte Plugin-Instanz, das Profil oder die Einstellung nicht nutzen. |
| `404` | Explizit referenzierte Ressource existiert nicht im sichtbaren Scope, z.B. Plugin-Instanz oder gespeichertes Profil. |
| `422` | Request ist formal gültig, kann aber fachlich nicht aufgelöst werden, z.B. fehlendes Mapping, unsupported Intent, verpflichtende Preference nicht unterstützbar oder alle Kandidaten wegen Segment-/Geometrievalidierung verworfen. |
| `429` | Host-Rate-Limit verhindert den Request vor oder während der Orchestrierung. |
| `502` | Alle ausgewählten Engines scheitern an Provider-/Connector-/Plugin-Fehlern ohne nutzbaren Kandidaten. |
| `504` | Alle ausgewählten Engines überschreiten die relevanten Timeouts ohne nutzbaren Kandidaten. |
| `500` | Unerwarteter Host-Fehler. |

Bei gemischten Fehlern ohne Kandidaten wählt der Host den Status nach der dominierenden Ursache: Client-/Mapping-Probleme vor Provider-Problemen, Rate-Limit vor Provider-Fehlern, Timeout nur dann `504`, wenn kein anderer nutzbarer Kandidat und kein spezifischerer Client- oder Policy-Fehler vorliegt. Sobald mindestens ein Kandidat nutzbar ist, bleibt die Antwort `200` und alle anderen Fehler werden als `engineErrors` oder `warnings` transportiert.

## Persistenz und Auflösung

Routing-Einstellungen, Intents, Mappings und provider-native Profile sind host-owned. Plugins liefern Discovery und Protokollübersetzung, persistieren aber keine eigenen Dateien oder User-Konfigurationen.

### `routing_settings`

Pro User existiert genau ein Settings-Record:

```text
routing_settings
  user
  primary_route_instance
  elevation_instance
  compare_instances
  default_intent
  default_variant_count
  default_preferences
```

`compare_instances` speichert Engines, die der Editor für parallele Vorschläge nutzt. `elevation_instance` darf leer sein; dann behält der Host je nach Request Provider-Höhen, bestehende GPX-Höhen oder liefert Geometrie ohne Höhen zurück. `default_variant_count` ist die User-Default-Anzahl sichtbarer Routenvorschläge, die der Editor in `options.desiredVariants` übernehmen kann.

`primary_route_profile` wird bewusst nicht in User-Settings gespeichert. Der Default läuft über `default_intent` plus Mapping-Auflösung, damit Settings nicht direkt an provider-native Profile gekoppelt werden.

### `routing_intents`

Kanonische Wanderer-Intents sollten getrennt von provider-nativen Profilen gespeichert werden:

```text
routing_intents
  id
  scope
  user
  key
  mode
  name
  description
  enabled
  created
  updated
```

Semantik:

- `scope = "builtin"` für Wanderer-Defaults.
- `scope = "admin"` für instanzweite Custom-Intents.
- `scope = "user"` für persönliche Varianten oder Aliase.
- `user` ist leer für Built-in- und Admin-Scopes und gesetzt für User-Scopes.
- `key` ist innerhalb von `(scope, user, key)` stabil, z.B. `bike_balanced` oder `bike_commute`.
- `mode` ist einer der generischen Modes wie `foot`, `bike` oder `motor`.
- Vergleichbarkeit gilt über den aufgelösten kanonischen Intent-Key.
- User-Intents sind nicht global vergleichbar, außer sie mappen explizit auf denselben Admin- oder Built-in-Key oder werden als Alias modelliert.

### `routing_profile_mappings`

Intent-zu-Plugin-Mappings liegen in einer separaten Collection:

```text
routing_profile_mappings
  id
  scope
  user
  intent_key
  plugin_id
  plugin_instance
  native_profile_id
  native_profile_key
  native_config
  priority
  enabled
  created
  updated
```

Semantik:

- `scope = "plugin"` für Mappings aus Plugin-Metadata; diese müssen nicht materialisiert werden.
- `scope = "admin"` für instanzweite Admin-Mappings.
- `scope = "user"` für persönliche Overrides.
- `native_profile_id` referenziert ein gespeichertes `routing_profiles`-Record, wenn das Mapping auf ein hochgeladenes oder erzeugtes Profil zeigt.
- `native_profile_key` referenziert ein plugin-deklariertes Profil wie `trekking`.
- `native_config` speichert provider-spezifische Option-Presets wie Valhalla `costing_options`.
- Mindestens eines der Felder `native_profile_id`, `native_profile_key` oder `native_config` muss gesetzt sein.
- `plugin_instance` ist optional. Wenn gesetzt, gilt das Mapping nur für diese konkrete Plugin-Instanz.

### `routing_profiles`

Provider-native Profile sind der zentrale Erweiterungspunkt für provider- spezifisches Verhalten. Sie sollten host-seitig gespeichert werden:

```text
routing_profiles
  id
  user
  plugin_id
  name
  key
  mode
  kind
  content
  content_type
  checksum
  metadata
  enabled
  created
  updated
```

Semantik:

- `kind = "builtin"` referenziert einen plugin-deklarierten Profil-Key und hat keinen Dateiinhalt.
- `kind = "custom_file"` speichert eine begrenzte User-Upload-Datei.
- `kind = "generated"` speichert ein aus Template und Preferences erzeugtes natives Profil, z.B. eine generierte BRouter-`.brf`.
- `plugin_id` scoped Profile auf die Engine, die sie versteht.
- `key` ist der provider-facing Profil-Identifier, sofern relevant.
- `content` ist verschlüsselt oder als geschützte Datei gespeichert, weil Profile persönliche Präferenzen enthalten können.
- `checksum` hilft, Duplikate, Caches und unveränderte generierte Profile zu erkennen.
- Der Host erzwingt Größen- und Content-Type-Limits, bevor er Profile an Plugins weitergibt.

BRouter kann damit `.brf`-Uploads unterstützen, ohne Valhalla oder andere Engines zur Kenntnis der BRouter-Profilsprache zu zwingen. Das BRouter-Plugin erhält den Profilinhalt und entscheidet, wie es ihn an BRouter-Service oder lokale Runtime übergibt.

Eingebaute Plugin-Profile werden nicht als Records materialisiert. Der Host listet sie aus Discovery über `GET /profiles`. Materialisiert werden nur User-Uploads, generierte Profile und Admin-/User-Overrides mit eigener Config.

### Mapping-Auflösung

Für einen Routing-Request löst der Host pro Engine in dieser Reihenfolge auf:

1. User wählt oder erhält einen `intent`.
2. Host bestimmt Route-Engine(s) aus Request oder User-Defaults.
3. Host sucht ein Mapping in dieser Reihenfolge: User-Mapping für `(user, intent, plugin_instance)`, User-Mapping für `(user, intent, plugin_id)`, Admin-Mapping für `(intent, plugin_instance)`, Admin-Mapping für `(intent, plugin_id)`, Plugin-Discovery-Mapping aus `metadata.routing.intents`.
4. Host kombiniert Mapping, native Config, Request-Preferences und Defaults aus Plugin-Discovery.
5. Host prüft Preference-Support und `requiredPreferences`.
6. Host baut daraus den `route.v1` Plugin-Input.

Wenn kein Mapping existiert, erzeugt der Host `mapping_missing`.

## Engine-Komposition

Der Host ist für Komposition verantwortlich:

1. Route-Plugin-Instanzen anhand von Request und User-Defaults auswählen.
2. Pro Engine eine begrenzte Anzahl nativer Alternativen anfragen, abgeleitet aus `desiredVariants`, `maxAlternatives`, Rate-Limits und Policy.
3. Geometrie, Summaries und Anchor-Pair-Segmente normalisieren.
4. Kandidaten validieren, eindeutig namespacen und eine begrenzte Shortlist bilden.
5. Falls Höhen angefragt wurden und Shortlist-Kandidaten keine brauchbaren Höhen haben, `elevation.v1` für diese Shortlist ergänzen.
6. Shortlist mit Höhenmetrik, Summary, Warnings und Geometrie auf höchstens `desiredVariants` sichtbare Varianten kuratieren.
7. Kandidaten mit Provider-Metadata ans Frontend zurückgeben.

Der Host kombiniert Kandidaten aus zwei Quellen: mehrere Alternativen derselben Engine und mehrere Engines im Parallel-Modus. Die finale Antwort ans Frontend ist eine flache Kandidatenliste mit eindeutiger Host-ID und Provenienz (`pluginId`, `instanceId`, `provider`, `profileKey`, optional native Kandidaten-ID). Dadurch kann der Editor Kandidaten stabil auswählen, auch wenn mehrere Engines denselben internen Kandidatennamen verwenden.

Die Pipeline wird phasenweise aktiviert. Phase 4 braucht bereits die Single-Engine-Komposition mit separater Elevation-Engine: Route von BRouter, Höhen z.B. von Valhalla, validiert und normalisiert durch den Host. Phase 5 aktiviert zusätzlich Multi-Engine-Fan-out, Teilfehler-Aggregation, Shortlist-Bildung über mehrere Engines und die finale Diversitäts-Kuratierung.

Der Host muss validieren, dass jeder zurückgegebene Kandidat auf die angefragten Anchor-Paare zurückführbar ist, bevor er das Ergebnis ans Frontend gibt. Ein Plugin darf global über alle Anchors routen, muss aber entweder Segment-Geometrien oder gültige `shapeRange`-Werte liefern, damit der Host das Ergebnis als ein GPX-`trkseg` pro Anchor-Paar materialisieren kann.

Unterstützte Setups:

- Valhalla für Routing und Höheninformationen.
- BRouter für Routing und Valhalla für Höheninformationen.
- Mehrere Routenkandidaten von BRouter und Valhalla.
- GraphHopper als Konzeptvalidierung für ein drittes Profil- und Custom-Model-Paradigma.
- Host-native Luftlinie mit Valhalla-Höhenkorrektur.
- Zukünftige Elevation-only-Plugins.

## Validierungsmatrix

Die Spezifikation gilt als tragfähig, wenn Valhalla das aktuelle Verhalten ersetzen kann, BRouter ohne Sonderpfad angebunden werden kann und GraphHopper als dritter Konzeptfall keine neuen Grundbegriffe erzwingt.

| Fähigkeit | Valhalla | BRouter | GraphHopper | Spezifikationsschluss |
| --- | --- | --- | --- | --- |
| `route.v1` | Ja. | Ja. | Ja. | Capability passt für alle Referenz-Engines. |
| `elevation.v1` | Ja. | Eher nein oder optional. | Ja, abhängig vom Setup. | Elevation muss eigenständig bleiben. |
| Costing-/Profilmodell | `costing_options`. | `.brf`-Profile. | Profile und Custom Models. | Wanderer-Intents mappen auf Provider-Dialekte. |
| Custom User-Profile | Native Config. | `.brf` Upload oder generiertes Profil. | Custom Model oder Config. | `routing_profiles.kind` braucht `custom_file` und `generated`. |
| Varianten | Valhalla Alternates. | Profil-/Service-abhängig. | Alternative Routes. | Host kuratiert Varianten provider-neutral. |
| Segment-Geometrie | Aus Legs und Shapes ableitbar. | Abhängig vom API-Output. | Aus Paths/Points ableitbar. | Segmentvertrag bleibt Pflicht. |
| Tuning-Preferences | Direkt über Optionen. | Über `.brf` Template oder Profilwahl. | Über Custom Model oder Advanced Config. | Preference-Support braucht `full`, `partial`, `template`, `advanced`. |
| Höhen fürs Ranking | Möglich. | Eher via externes Elevation-Plugin. | Möglich. | Shortlist-Elevation im Host ist nötig. |
| Provider-native Advanced UI | Costing Options. | Profilwahl und Upload. | Custom Model. | Advanced UI bleibt getrennt von Standard-Preferences. |

Validierungsfälle:

1. Valhalla-only ersetzt den heutigen Zustand. `hike`, `bike_balanced` und `car` funktionieren über das Valhalla-Plugin, Elevation kommt von Valhalla, `pedestrian` migriert auf `hike`, und alte `/api/v1/valhalla/*`-Endpunkte werden entfernt.
2. BRouter plus Valhalla Elevation funktioniert ohne Sonderpfad. Routing nutzt z.B. BRouter `trekking`, Elevation nutzt Valhalla, `.brf` Uploads sind möglich, und generierte `.brf` Profile können aus Preferences entstehen.
3. Paralleles Routing mit Valhalla und BRouter nutzt denselben Wanderer-Intent, z.B. `gravel`. `desiredVariants` begrenzt die sichtbaren Kandidaten, der Host kuratiert Varianten, und Teilfehler einer Engine verwerfen andere Kandidaten nicht.
4. GraphHopper passt als Konzeptcheck. Intents lassen sich auf Profile oder Custom Models mappen, Preferences können über Custom Models oder Advanced Config abgebildet werden, und GraphHopper-Sprache wird nicht zur Wanderer- Standard-API.
5. Host-native Luftlinie bleibt ohne Routing-Plugin möglich. Elevation kann trotzdem über `elevation.v1` ergänzt werden, und das Segmentmodell bleibt erhalten.

## Umsetzungsphasen für OSPX

Das Konzept beschreibt den Zielzustand. Für die Umsetzung sollte daraus nicht ein einzelner großer Change entstehen, sondern eine Folge kleiner, reviewbarer OSPX-Changes. Jede Phase darf das Zielbild weiter vorbereiten und muss für sich testbar bleiben. Phase 1 ist dabei bewusst die Ausnahme beim Risiko: Der Valhalla-Cutover ist ein harter Schnitt ohne Legacy-Adapter. Dieses Risiko wird nicht durch Rollback-Kompatibilität reduziert, sondern durch klare Definition-of-Done, direkte Frontend-Umstellung und Tests gegen das bisherige Editor-Verhalten.

Empfohlene Phasen:

| Phase | OSPX-Change | Ziel | Enthält | Noch nicht enthalten |
| --- | --- | --- | --- | --- |
| 1 | `phase-1-routing-plugin-valhalla-cutover` | Valhalla läuft als erstes `routing`-Plugin und ersetzt die alten Endpunkte. | `route.v1`/`elevation.v1` für Valhalla, harte Entfernung von `/api/v1/valhalla/*`, Frontend-Umbenennung von `valhalla_*` auf `routing_*`, `pedestrian` -> `hike`, eingebaute Default-Intents/-Mappings für `hike`, `bike_balanced` und `car`, aktuelle Preferences fest verdrahtet für Valhalla, Segmentvertrag und Polyline-Konvention als funktionale Definition-of-Done. | BRouter, parallele Varianten, User-Uploads, persistente Intent-/Mapping-Administration. |
| 2 | `phase-2-routing-host-contracts` | Host-Verträge werden gehärtet und testbar gemacht. | Host-Route-Response, vollständige HTTP-Status-Matrix, Fehlercodes, Elevation-Status, Limits, Konformitäts- und Grenzfalltests für Segmentvertrag und Polyline-Konvention. | Neue Provider, komplexe Profilverwaltung. |
| 3 | `phase-3-routing-intents-profiles-mappings` | Default-Intents, Preferences und Mapping-Auflösung werden persistent und administrierbar. | `routing_settings`, `routing_intents`, `routing_profile_mappings`, `routing_profiles`, Standard-Preferences, effective controls; die in Phase 1 fest verdrahteten Defaults werden in Collections und Admin-/User-Auflösung überführt. | BRouter-spezifische `.brf`-Runtime, Multi-Engine-Fan-out. |
| 4 | `phase-4-routing-plugin-brouter` | BRouter validiert die Abstraktion als zweite strukturell andere Engine. | BRouter `route.v1`, native Profile, `.brf` Upload, generierte `.brf`-Profile aus Templates, Single-Engine-BRouter-Routing mit separater Elevation-Engine wie Valhalla. | Automatische Cross-Engine-Kandidatenauswahl, Parallel-Fan-out. |
| 5 | `phase-5-routing-parallel-variants` | Mehrere Engines und mehrere Varianten werden im Editor vergleichbar nutzbar. | Parallel-Fan-out, Teilfehler-Aggregation, `desiredVariants`, Distanz-/Kontext-Heuristik, Kandidaten-Shortlist, Diversitäts-Kuratierung, UI-Kandidatenvergleich. | Cross-Engine-Stitching und Profilformat-Übersetzung bleiben ausgeschlossen. |

Phase 1 und 2 können eng zusammen umgesetzt werden, sollten aber als getrennte OSPX-Changes beschrieben werden: Phase 1 ist der funktionale Cutover und muss bereits die Mindestverträge implementieren, die der Editor braucht. Phase 2 härtet diese Verträge für alle späteren Provider aus. Phase 3 hebt die Phase-1-Defaults aus fest verdrahteten Valhalla-Mappings in persistente, administrierbare Collections. Phase 4 nutzt die Komposition "Routing-Engine != Elevation-Engine" bereits im Single-Engine-Pfad. Phase 5 ergänzt erst danach Multi-Engine-Fan-out und kuratierte Varianten.

## Valhalla-Plugin-Migration

Valhalla soll das erste Routing-Plugin sein und das aktuelle Verhalten möglichst nah erhalten. Die Migration ist bewusst ein harter Schnitt ohne Legacy-Adapter: Die alten `/api/v1/valhalla/*`-Endpunkte werden entfernt, und das Frontend wird direkt auf die neue Routing-API umgestellt.

Mapping aus aktuellen Wanderer-Optionen:

| Aktuelle Option | Routing-API | Valhalla-Mapping |
| --- | --- | --- |
| `modeOfTransport: "pedestrian"` | `mode: "foot"`, Intent `hike` | `costing: "pedestrian"` mit Hiking-Preset |
| `modeOfTransport: "bicycle"` | `mode: "bike"`, Intent `bike_balanced` | `costing: "bicycle"` |
| `modeOfTransport: "auto"` | `mode: "motor"`, Intent `car` | `costing: "auto"` |
| `walking_speed` | `preferences.speedKmh` bei `foot` | `pedestrian.walking_speed` |
| `use_hills` | `preferences.hillPreference` bei `foot`/`bike` | `pedestrian.use_hills` oder `bicycle.use_hills` |
| `max_hiking_difficulty` | `preferences.maxHikingDifficulty` | `pedestrian.max_hiking_difficulty` |
| `bicycle_type` | `preferences.bicycleType` | `bicycle.bicycle_type` |
| `cycling_speed` | `preferences.speedKmh` bei `bike` | `bicycle.cycling_speed` |
| `use_roads` | `preferences.roadPreference` | `bicycle.use_roads` |
| `avoid_bad_surfaces` | `preferences.avoidBadSurfaces` | `bicycle.avoid_bad_surfaces` |
| `fixed_speed` | `preferences.fixedSpeedKmh` | `auto.fixed_speed` |
| `top_speed` | `preferences.topSpeedKmh` | `auto.top_speed` |
| `width` | `preferences.vehicleWidthM` | `auto.width` |
| `height` | `preferences.vehicleHeightM` | `auto.height` |
| `shortest` | `preferences.shortest` | `shortest` in `costing_options` |
| Advanced Valhalla Costing Options | Valhalla-Profil/Config oder `native_config` | native `costing_options` |

Das initiale Valhalla-Plugin kann eingebaute Profile anbieten:

- `pedestrian`
- `hiking`
- `bicycle`
- `mountain_bike`
- `auto`

Das Plugin übersetzt jedes Profil in Valhalla `costing` und `costing_options`. Bestehende Advanced-UI-Controls können entweder zunächst als Valhalla-spezifische Profileinstellungen erhalten bleiben oder hinter generischen Preferences vereinfacht werden. Die wichtige Architekturänderung ist: Der generische Route-Editor importiert keine Valhalla-Response-Typen mehr.

Migrationsschritte:

1. Neue Host-API für Routing, Elevation, Engines, Profile, Settings und Mappings einführen.
2. Valhalla als First-Party-Routing-Plugin mit `route.v1` und `elevation.v1` registrieren.
3. Bestehende Valhalla-Defaults in `routing_settings`, `routing_profile_mappings` und `native_config` überführen.
4. Alte `/api/v1/valhalla/route`- und `/api/v1/valhalla/height`-Endpunkte entfernen.
5. Frontend vollständig von `valhalla_*` auf `routing_*` umbenennen.
6. `GPX.correctElevation()` und Route-Editing ausschließlich über die generische Routing-/Elevation-API führen.

Es wird kein Kompatibilitätsadapter für die alten Valhalla-Endpunkte gebaut. Der Migrationsdefault für `modeOfTransport: "pedestrian"` ist der Wanderer- Intent `hike`, weil der Trail-Editor primär Outdoor-/Wanderplanung abbildet und bestehende Optionen wie `max_hiking_difficulty` diese Semantik bereits nahelegen.

## Frontend-Migration

Das Frontend wird auf generische Routing-Begriffe umbenannt:

- `valhalla_store` wird `routing_store`.
- `ValhallaAnchor` wird `RoutingAnchor`.
- `valhalla_anchor_util` wird zu einem generischen Anchor-/Routing-Utility.
- `web/src/lib/models/valhalla.ts` wird durch generische Routing-Modelle plus provider-spezifische Advanced-Typen ersetzt.
- `/api/v1/valhalla/route`-Calls werden `/api/v1/plugins/routing/route`.
- `/api/v1/valhalla/height`-Calls werden `/api/v1/plugins/routing/elevation`.
- `GPX.correctElevation()` akzeptiert optional eine Provider-Auswahl und ruft den generischen Elevation-Endpunkt auf.

Der Route-Editor sollte initial dieselbe Editing-Erfahrung rendern. Engine-Auswahl kann als kompakte Einstellung nahe den bestehenden Routing-Optionen eingeführt werden:

- primäre Routing-Engine;
- Wanderer-Intent;
- natives Routing-Profil oder Mapping;
- Elevation-Engine;
- optionale Aktion für Vergleich mehrerer Engines.

### UI- und Editor-Vertrag

Der Trail Editor spricht ausschließlich die Host-API. Er kennt keine Valhalla-, BRouter- oder GraphHopper-Requestformate. Provider-spezifische UI ist nur im Advanced-Bereich sichtbar.

Editor-State:

```text
routing_editor_state
  auto_routing_enabled
  intent
  route_engine_mode
  primary_route_instance
  compare_instances
  elevation_instance
  desired_variants
  preferences
  selected_candidate_id
```

Semantik:

- `route_engine_mode` ist `single` oder `parallel`.
- `intent` ist ein kanonischer Wanderer-Intent.
- `desired_variants` ist die gewünschte finale Anzahl sichtbarer Kandidaten; der Host darf sie für kurze Segmente oder bei Limits effektiv reduzieren.
- `selected_candidate_id` referenziert eine Host-generierte Candidate-ID aus der letzten Route-Response.

Standard-Controls im Editor:

- Auto-Routing Toggle;
- Intent-Auswahl;
- Engine-Modus `single` oder `parallel`;
- primäre Routing-Engine;
- Vergleichs-Engines bei `parallel`;
- Elevation-Engine;
- gewünschte Variantenanzahl;
- explizite Vergleichsaktion oder automatische Vergleichsanfrage, wenn Host- Policy und Segmentlänge Varianten sinnvoll erscheinen lassen;
- mode-/intent-abhängige Preferences;
- Kandidatenliste oder Kartenvergleich, wenn mehr als ein Kandidat zurückkommt.

Der Host liefert effektive UI-Metadaten für die aktuelle Auswahl aus Intent und Engines. Das Frontend muss Discovery mehrerer Engines nicht selbst zu vergleichbaren Controls verrechnen. Raw Discovery bleibt über `GET /api/v1/plugins/routing/engines` verfügbar; effektive Controls können über Settings oder einen Resolver-Endpunkt bereitgestellt werden.

Preference-Anzeige:

| Support | Standard-UI |
| --- | --- |
| `full` | Normal anzeigen. |
| `partial` | Anzeigen, aber mit Hinweis oder Warning. |
| `template` | Anzeigen, wenn Template-Generierung für diesen Provider aktiv ist. |
| `advanced` | Nur im Advanced-Bereich anzeigen. |
| `unsupported` | Ausblenden. |

Bei Parallel-Routing zeigt die Standard-UI nur Preferences, die alle ausgewählten Engines mindestens `partial` unterstützen. Wenn eine Engine `advanced` oder `unsupported` meldet, ist der Regler für den Parallelvergleich nicht vergleichbar und wird ausgeblendet oder entsprechend markiert. `requiredPreferences` dürfen bei Parallel-Routing nicht ignoriert werden.

Kandidatenanzeige:

- `candidates` aus der Host-Response ist bereits final kuratiert.
- Die UI sortiert Kandidaten nicht nach provider-eigenen Scores neu.
- Die UI zeigt Label, Provider/Profil, Distanz, Dauer, Höhengewinn/-verlust, Warnings und Elevation-Status.
- Akzeptieren eines Kandidaten materialisiert dessen `segments` als GPX- `trkseg`.

Manuelle Luftlinie bleibt host- oder frontend-nativ und ist kein Routing-Plugin. Elevation kann trotzdem über die ausgewählte Elevation-Engine korrigiert werden.

Advanced UI:

- native Profilwahl;
- User-Upload, z.B. BRouter-`.brf`;
- `native_config` und Valhalla Advanced Costing Options;
- plugin-spezifische Controls, klar getrennt von Standard-Wanderer- Preferences.

## Sicherheit und Limits

Routing-Plugins nutzen dasselbe Trust-Modell wie andere Plugin-Typen. Die folgenden Werte sind initiale Host-Defaults und durch Admin-Konfiguration anpassbar. Plugins dürfen diese Limits nicht selbst erhöhen.

Host-erzwungene Limits:

| Limit | Initialer Default |
| --- | --- |
| Anchors pro Request | `2..100` |
| Engines pro Parallel-Request | `1..5` |
| `desiredVariants` | `1..5` |
| Native Alternativen pro Engine | max. `min(plugin.maxAlternatives, 5)` |
| Decodierte Punkte pro Kandidat | max. `20000` |
| Decodierte Punkte pro Host-Response | max. `50000` |
| Profil-Upload-Größe | max. `64 KiB` |
| Provider-Response-Body | max. `4 MiB` |
| Plugin-Invocation-Timeout `route.v1` | `8000ms` |
| Plugin-Invocation-Timeout `elevation.v1` | `8000ms` |
| Gesamt-Orchestrierungs-Timeout | `15000ms` |

Connector-Policy:

- Plugins dürfen keine freien Provider-URLs aufrufen.
- Netzwerkzugriff ist nur über deklarierte Connectors erlaubt.
- Connector-Config setzt `baseURL`, `allowedPathPrefixes`, TLS-, Redirect- und Private-Network-Policy.
- Credentials und sensitive Headers werden vom Host angebracht, nicht vom Plugin.
- Private Network ist standardmäßig verboten.
- Redirects sind nur innerhalb erlaubter Host- und Path-Policy zulässig.

Rate-Limits gelten pro User und Plugin-Instanz. Initiale Defaults:

| Limit | Initialer Default |
| --- | --- |
| Route-Requests | `30/min` pro User und Instanz |
| Elevation-Requests | `60/min` pro User und Instanz |
| Parallel laufende Routing-Requests | `3` pro User |
| Öffentliche Default-Instanzen | konservativer, z.B. `10 route/min` pro User |

Profil-Uploads brauchen besondere Sorgfalt:

- Extension und Content-Type müssen zu `nativeProfileUpload` passen.
- Max Bytes kommen aus Plugin-Metadata, dürfen aber das Host-Limit `64 KiB` nicht überschreiten.
- Dateinamen haben keine Pfadsemantik.
- Profilinhalt wird vom Host nicht als ausführbarer Code interpretiert.
- Profile werden geschützt gespeichert.
- Das Plugin erhält Profilinhalt nur für die konkrete Invocation.

Policy-Verstöße nutzen die bestehenden Fehlercodes:

| Situation | Fehlercode |
| --- | --- |
| Connector, Pfad oder Netzwerkziel nicht erlaubt | `connector_denied` |
| Provider- oder Plugin-Response zu groß | `response_too_large` |
| Kandidat verletzt Punkt-, Segment- oder Geometrie-Limits | `candidate_policy_violation` |
| User, Instanz oder Provider limitiert | `provider_rate_limited` |
| Profil-Upload oder generiertes Profil ist ungültig | `profile_invalid` |

Öffentliche Default-Instanzen wie `valhalla1.openstreetmap.de` unterliegen Fair-Use- und Rate-Limit-Erwartungen. Paralleles Routing und Varianten erhöhen die Anzahl der Provider-Requests. Der Host muss deshalb pro User, Plugin-Instanz und Provider konservative Defaults erzwingen können.

