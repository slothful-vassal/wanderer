import {
    UserCategoryPreferenceUpsertSchema,
} from "$lib/models/api/category_preference_schema";
import type { UserCategoryPreference } from "$lib/models/category_preference";
import { Collection, handleError } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        if (!event.locals.user) {
            return json([]);
        }

        const preferences = await event.locals.pb
            .collection(Collection.user_category_preferences)
            .getFullList<UserCategoryPreference>({
                filter: event.locals.pb.filter("user = {:user}", {
                    user: event.locals.user.id,
                }),
                requestKey: null,
            });

        return json(preferences);
    } catch (e) {
        return handleError(e);
    }
}

export async function PUT(event: RequestEvent) {
    try {
        if (!event.locals.user) {
            return json({ message: "Unauthorized" }, { status: 401 });
        }

        const data = await event.request.json();
        const safeData = UserCategoryPreferenceUpsertSchema.parse(data);

        const payload = {
            ...safeData,
            user: event.locals.user.id,
        };

        let preference: UserCategoryPreference | undefined;
        try {
            preference = await event.locals.pb
                .collection(Collection.user_category_preferences)
                .getFirstListItem<UserCategoryPreference>(
                    event.locals.pb.filter("user = {:user} && category = {:category}", {
                        user: event.locals.user.id,
                        category: safeData.category,
                    }),
                    { requestKey: null },
                );
        } catch {
            preference = undefined;
        }

        const saved = preference?.id
            ? await event.locals.pb
                  .collection(Collection.user_category_preferences)
                  .update<UserCategoryPreference>(preference.id, payload, {
                      requestKey: null,
                  })
            : await event.locals.pb
                  .collection(Collection.user_category_preferences)
                  .create<UserCategoryPreference>(payload, {
                      requestKey: null,
                  });

        return json(saved);
    } catch (e) {
        return handleError(e);
    }
}
