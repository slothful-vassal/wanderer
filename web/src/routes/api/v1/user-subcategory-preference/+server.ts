import { UserSubcategoryPreferenceUpsertSchema } from "$lib/models/api/subcategory_preference_schema";
import type { UserSubcategoryPreference } from "$lib/models/subcategory_preference";
import { Collection, handleError } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        if (!event.locals.user) {
            return json([]);
        }

        const preferences = await event.locals.pb
            .collection(Collection.user_subcategory_preferences)
            .getFullList<UserSubcategoryPreference>({
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
        const safeData = UserSubcategoryPreferenceUpsertSchema.parse(data);

        const payload = {
            ...safeData,
            user: event.locals.user.id,
        };

        let preference: UserSubcategoryPreference | undefined;
        try {
            preference = await event.locals.pb
                .collection(Collection.user_subcategory_preferences)
                .getFirstListItem<UserSubcategoryPreference>(
                    event.locals.pb.filter(
                        "user = {:user} && subcategory = {:subcategory}",
                        {
                            user: event.locals.user.id,
                            subcategory: safeData.subcategory,
                        },
                    ),
                    { requestKey: null },
                );
        } catch {
            preference = undefined;
        }

        const saved = preference?.id
            ? await event.locals.pb
                  .collection(Collection.user_subcategory_preferences)
                  .update<UserSubcategoryPreference>(preference.id, payload, {
                      requestKey: null,
                  })
            : await event.locals.pb
                  .collection(Collection.user_subcategory_preferences)
                  .create<UserSubcategoryPreference>(payload, {
                      requestKey: null,
                  });

        return json(saved);
    } catch (e) {
        return handleError(e);
    }
}
