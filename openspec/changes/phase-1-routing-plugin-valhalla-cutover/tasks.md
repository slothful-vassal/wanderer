# Tasks: routing-plugin-valhalla-cutover

- [ ] Add first-party Valhalla routing plugin metadata and capability registration.
- [ ] Implement Valhalla `route.v1` adapter.
- [ ] Implement Valhalla `elevation.v1` adapter.
- [ ] Add host routing endpoints needed by the cutover.
- [ ] Remove `/api/v1/valhalla/route` and `/api/v1/valhalla/height`.
- [ ] Rename frontend Valhalla routing state, models, and utilities to generic routing names.
- [ ] Map current Valhalla tuning options to built-in canonical preferences.
- [ ] Ensure route candidates produce one segment per adjacent anchor pair.
- [ ] Verify polyline encoding/decoding uses factor `1e6` and `[lat, lon]`.
- [ ] Test current Trail Editor planning flows against the new routing API.
