import { z, ZodType } from "zod";
import type { Integration } from "../integration";

const StravaSchema = z.object({
    clientId: z.number({ coerce: true }).int().nonnegative(),
    clientSecret: z.string().length(40).optional().or(z.literal('')),
    routes: z.boolean(),
    activities: z.boolean(),
    active: z.boolean(),
    after: z.string().date().optional(),
})

const KomootSchema = z.object({
    email: z.string().email(),
    password: z.string(),
    completed: z.boolean(),
    planned: z.boolean(),
    active: z.boolean(),
})

const ImmichSchema = z.object({
    url: z.string().url(),
    apiKey: z.string(),
    timeWindowMinutes: z.number({ coerce: true }).int().min(0).max(1440),
    maxDistanceMeters: z.number({ coerce: true }).int().min(10).max(5000),
    maxWaypoints: z.number({ coerce: true }).int().min(1).max(200),
    useForStrava: z.boolean(),
    useForKomoot: z.boolean(),
    active: z.boolean(),
})

const IntegrationCreateSchema = z.object({
    user: z.string().length(15),
    strava: StravaSchema.optional(),
    komoot: KomootSchema.optional(),
    immich: ImmichSchema.optional()

}) satisfies ZodType<Integration>

const IntegrationUpdateSchema = z.object({
    strava: StravaSchema.optional().nullable(),
    komoot: KomootSchema.optional().nullable(),
    immich: ImmichSchema.optional().nullable()
}) satisfies ZodType<Partial<Integration>>

export { StravaSchema, IntegrationCreateSchema, IntegrationUpdateSchema, KomootSchema, ImmichSchema };
