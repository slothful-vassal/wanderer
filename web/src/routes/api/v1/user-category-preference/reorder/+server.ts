import {
    UserCategoryPreferenceReorderSchema,
} from "$lib/models/api/category_preference_schema";
import { handleError } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function POST(event: RequestEvent) {
    try {
        if (!event.locals.user) {
            return json({ message: "Unauthorized" }, { status: 401 });
        }

        const data = await event.request.json();
        const safeData = UserCategoryPreferenceReorderSchema.parse(data);
        const response = await event.locals.pb.send(
            "/category-preferences/reorder",
            {
                method: "POST",
                body: JSON.stringify(safeData),
                fetch: event.fetch,
                requestKey: null,
            },
        );

        return json(response);
    } catch (e) {
        return handleError(e);
    }
}
