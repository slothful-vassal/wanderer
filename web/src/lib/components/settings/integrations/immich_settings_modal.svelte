<script lang="ts">
    import Modal from "$lib/components/base/modal.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import { ImmichSchema } from "$lib/models/api/integration_schema";
    import type {
        ImmichIntegration,
        Integration,
    } from "$lib/models/integration";
    import { validator } from "@felte/validator-zod";
    import { createForm } from "felte";
    import { _ } from "svelte-i18n";

    interface Props {
        integration?: Integration;
        onsave?: (immichIntegration: ImmichIntegration) => void;
    }

    let { integration, onsave }: Props = $props();

    let modal: Modal;

    export function openModal() {
        errors.set({});
        modal.openModal();
    }

    const {
        form,
        errors,
    } = createForm({
        initialValues: {
            url: integration?.immich?.url ?? "",
            apiKey: integration?.immich?.apiKey ?? "",
            timeWindowMinutes: integration?.immich?.timeWindowMinutes ?? 120,
            maxDistanceMeters: integration?.immich?.maxDistanceMeters ?? 150,
            maxWaypoints: integration?.immich?.maxWaypoints ?? 25,
            active: integration?.immich?.active ?? false,
        },
        extend: validator({
            schema: ImmichSchema,
        }),
        onSubmit: async (form) => {
            form.active = integration?.immich?.active ?? form.active;
            onsave?.(form);
            modal.closeModal();
        },
    });
</script>

<Modal
    id="immich-settings-modal"
    size="md:min-w-lg"
    title={"Immich " + $_("settings")}
    bind:this={modal}
>
    {#snippet content()}
        <form class="space-y-4" id="immich-settings-form" use:form>
            <TextField
                label={$_("immich-url-label")}
                name="url"
                placeholder="https://immich.example.com"
                error={$errors.url}
            ></TextField>
            <TextField
                label={$_("immich-api-key-label")}
                name="apiKey"
                type="password"
                placeholder={integration?.immich
                    ? `(${$_("unchanged")})`
                    : "eyJhbGciOiJIUzI..."}
                error={$errors.apiKey}
            ></TextField>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextField
                    label={$_("immich-time-window-minutes")}
                    name="timeWindowMinutes"
                    type="number"
                    error={$errors.timeWindowMinutes}
                ></TextField>
                <TextField
                    label={$_("immich-distance-threshold-meters")}
                    name="maxDistanceMeters"
                    type="number"
                    error={$errors.maxDistanceMeters}
                ></TextField>
                <TextField
                    label={$_("immich-max-waypoints")}
                    name="maxWaypoints"
                    type="number"
                    error={$errors.maxWaypoints}
                ></TextField>
            </div>
            <p class="text-xs text-gray-500">
                {$_("immich-settings-hint")}
            </p>
        </form>
    {/snippet}
    {#snippet footer()}
        <div class="flex items-center gap-4">
            <button class="btn-secondary" onclick={() => modal.closeModal()}
                >{$_("cancel")}</button
            >
            <button
                class="btn-primary"
                form="immich-settings-form"
                type="submit"
            >
                {$_("save")}
            </button>
        </div>
    {/snippet}
</Modal>
