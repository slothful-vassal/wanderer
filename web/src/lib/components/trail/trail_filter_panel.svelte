<script lang="ts">
    import type { Category } from "$lib/models/category";
    import type { Subcategory } from "$lib/models/subcategory";
    import type { TrailFilter } from "$lib/models/trail";
    import { categoryPreferences } from "$lib/stores/category_preference_store";
    import { subcategoryPreferences } from "$lib/stores/subcategory_preference_store";
    import { searchLocations } from "$lib/stores/search_store";
    import { subcategories } from "$lib/stores/subcategory_store";
    import { tags_index } from "$lib/stores/tag_store";
    import { currentUser } from "$lib/stores/user_store";
    import {
        noSubcategoryFilterCategory,
        noSubcategoryFilterValue,
    } from "$lib/util/trail_filter_util";
    import {
        displayCategoryIcon,
        displayCategoryName,
        displayCategoryShortName,
        displaySubcategoryBadgeIcon,
        displaySubcategoryIcon,
        displaySubcategoryLabel,
        preferenceForCategory,
        sortedCategoriesByPreference,
        subcategoryVisible,
    } from "$lib/util/category_util";
    import { formatDistance, formatElevation } from "$lib/util/format_util";
    import { getIconForLocation } from "$lib/util/icon_util";
    import { _, locale } from "svelte-i18n";
    import { slide } from "svelte/transition";
    import ActorSearch from "../actor_search.svelte";
    import Combobox, { type ComboboxItem } from "../base/combobox.svelte";
    import Datepicker from "../base/datepicker.svelte";
    import DoubleSlider from "../base/double_slider.svelte";
    import MultiSelect from "../base/multi_select.svelte";
    import type { RadioItem } from "../base/radio_group.svelte";
    import RadioGroup from "../base/radio_group.svelte";
    import Search, { type SearchItem } from "../base/search.svelte";
    import type { SelectItem } from "../base/select.svelte";
    import Slider from "../base/slider.svelte";

    interface Props {
        categories: Category[];
        filterExpanded?: boolean;
        filter: TrailFilter;
        showTrailSearch?: boolean;
        showCitySearch?: boolean;
        onupdate?: (filter: TrailFilter) => void;
    }

    let {
        categories,
        filterExpanded = $bindable(true),
        filter = $bindable(),
        showTrailSearch = true,
        showCitySearch = true,
        onupdate,
    }: Props = $props();

    let categorySelectItems = $derived(
        sortedCategoriesByPreference(
            categories,
            $categoryPreferences,
            $locale,
            $_,
        )
            .filter(
                (c) =>
                    !preferenceForCategory($categoryPreferences, c.id)
                        ?.exclude_search || filter.category.includes(c.id),
            )
            .map((c) => ({
                value: c.id,
                text: displayCategoryName(c, $locale, $_),
                icon: displayCategoryIcon(c),
            })),
    );
    let explicitExcludedSearchCategories = $derived(
        categories
            .filter(
                (category) =>
                    filter.category.includes(category.id) &&
                    preferenceForCategory($categoryPreferences, category.id)
                        ?.exclude_search,
            )
            .map((category) => displayCategoryName(category, $locale, $_)),
    );
    let hoveredCategoryId: string | undefined = $state();
    let categoryTooltip = $state("");
    let categoryTooltipStyle = $state("");
    let longPressTimer: ReturnType<typeof setTimeout> | undefined;
    let longPressCategoryId: string | undefined;
    let longPressStart:
        | {
              x: number;
              y: number;
          }
        | undefined;
    let suppressCategoryClick: string | undefined;
    let suppressCategoryClickTimer: ReturnType<typeof setTimeout> | undefined;
    let hoveredCategoryItem = $derived(
        categorySelectItems.find(
            (category) => category.value === hoveredCategoryId,
        ),
    );
    let hoveredSubcategories = $derived(
        hoveredCategoryId
            ? $subcategories.filter(
                  (subcategory) =>
                      subcategory.category === hoveredCategoryId &&
                      (subcategoryVisible(
                          subcategory.id,
                          $subcategoryPreferences,
                      ) ||
                          selectedSubcategoryIds.includes(subcategory.id)),
              )
            : [],
    );
    let subcategoryOverlayStyle = $state("");
    let selectedSubcategoryIds = $derived(filter.subcategory ?? []);

    const radioGroupCompletenessItems: RadioItem[] = [
        { text: $_("completed"), value: "completed" },
        { text: $_("not-completed"), value: "not_completed" },
        { text: $_("no-preference"), value: "no_preference" },
    ];

    const difficultyItems: SelectItem[] = [
        { text: $_("easy"), value: 0 },
        { text: $_("moderate"), value: 1 },
        { text: $_("difficult"), value: 2 },
    ];

    let searchDropdownItems: SearchItem[] = $state([]);

    let citySearchQuery: string = $state("");

    let tagItems: ComboboxItem[] = $state([]);

    async function update() {
        onupdate?.(filter);
    }

    function toggleCategoryFilter(category: SelectItem) {
        if (filter.category.includes(category.value)) {
            filter.category = filter.category.filter((id) => id !== category.value);
            if (hoveredCategoryId === category.value) {
                hoveredCategoryId = undefined;
            }
            filter.subcategory = selectedSubcategoryIds.filter(
                (id) =>
                    noSubcategoryFilterCategory(id) !== category.value &&
                    !$subcategories.some(
                        (subcategory) =>
                            subcategory.id === id &&
                            subcategory.category === category.value,
                    ),
            );
        } else {
            filter.category = [...filter.category, category.value];
        }

        update();
    }

    function handleCategoryClick(e: MouseEvent, category: SelectItem) {
        if (suppressCategoryClick === category.value) {
            e.preventDefault();
            e.stopPropagation();
            clearSuppressedCategoryClick();
            return;
        }

        toggleCategoryFilter(category);
    }

    function toggleNoSubcategoryFilter(category: SelectItem) {
        const value = noSubcategoryFilterValue(category.value);

        if (selectedSubcategoryIds.includes(value)) {
            filter.subcategory = selectedSubcategoryIds.filter((id) => id !== value);
        } else {
            if (!filter.category.includes(category.value)) {
                filter.category = [...filter.category, category.value];
            }
            filter.subcategory = [...selectedSubcategoryIds, value];
        }

        update();
    }

    function toggleSubcategoryFilter(subcategory: Subcategory) {
        if (selectedSubcategoryIds.includes(subcategory.id)) {
            filter.subcategory = selectedSubcategoryIds.filter(
                (id) => id !== subcategory.id,
            );
        } else {
            if (!filter.category.includes(subcategory.category)) {
                filter.category = [...filter.category, subcategory.category];
            }
            filter.subcategory = [...selectedSubcategoryIds, subcategory.id];
        }

        update();
    }

    function showSubcategoryOverlay(
        category: SelectItem,
        hasSubcategories: boolean,
        target: EventTarget | null,
    ) {
        if (!(target instanceof HTMLElement)) {
            hoveredCategoryId = undefined;
            subcategoryOverlayStyle = "";
            hideFilterTooltip();
            return;
        }

        const rect = target.getBoundingClientRect();
        showCategoryTooltip(category.text, rect);

        if (!hasSubcategories) {
            hoveredCategoryId = undefined;
            subcategoryOverlayStyle = "";
            return;
        }

        subcategoryOverlayStyle = [
            `top: ${rect.bottom}px`,
            `left: ${rect.left}px`,
            "max-width: calc(100vw - 2rem)",
        ].join("; ");
        hoveredCategoryId = category.value;
    }

    function hideSubcategoryOverlay(category: SelectItem) {
        if (hoveredCategoryId === category.value) {
            hoveredCategoryId = undefined;
            subcategoryOverlayStyle = "";
        }
        hideFilterTooltip();
    }

    function startCategoryLongPress(
        e: PointerEvent,
        category: SelectItem,
        hasSubcategories: boolean,
    ) {
        if (e.pointerType === "mouse" || !hasSubcategories) {
            return;
        }

        clearCategoryLongPress();
        longPressCategoryId = category.value;
        longPressStart = { x: e.clientX, y: e.clientY };
        const target = e.currentTarget;

        longPressTimer = setTimeout(() => {
            suppressNextCategoryClick(category.value);
            showSubcategoryOverlay(category, hasSubcategories, target);
            longPressTimer = undefined;
        }, 450);
    }

    function moveCategoryLongPress(e: PointerEvent) {
        if (!longPressStart || e.pointerType === "mouse") {
            return;
        }

        const deltaX = Math.abs(e.clientX - longPressStart.x);
        const deltaY = Math.abs(e.clientY - longPressStart.y);
        if (deltaX > 10 || deltaY > 10) {
            clearCategoryLongPress();
        }
    }

    function clearCategoryLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
        }
        longPressTimer = undefined;
        longPressCategoryId = undefined;
        longPressStart = undefined;
    }

    function handleCategoryPointerUp(e: PointerEvent) {
        if (
            e.pointerType !== "mouse" &&
            longPressCategoryId &&
            !longPressTimer
        ) {
            e.preventDefault();
        }

        clearCategoryLongPress();
    }

    function suppressNextCategoryClick(categoryId: string) {
        clearSuppressedCategoryClick();
        suppressCategoryClick = categoryId;
        suppressCategoryClickTimer = setTimeout(() => {
            clearSuppressedCategoryClick();
        }, 700);
    }

    function clearSuppressedCategoryClick() {
        if (suppressCategoryClickTimer) {
            clearTimeout(suppressCategoryClickTimer);
        }
        suppressCategoryClickTimer = undefined;
        suppressCategoryClick = undefined;
    }

    function showFilterTooltip(text: string, target: EventTarget | null) {
        if (!(target instanceof HTMLElement)) {
            hideFilterTooltip();
            return;
        }

        showCategoryTooltip(text, target.getBoundingClientRect());
    }

    function hideFilterTooltip() {
        categoryTooltip = "";
        categoryTooltipStyle = "";
    }

    function showCategoryTooltip(text: string, rect: DOMRect) {
        const tooltipWidth = text.length * 7 + 20;
        const viewportPadding = 8;
        const left = Math.max(
            viewportPadding,
            Math.min(
                rect.left + rect.width / 2 - tooltipWidth / 2,
                window.innerWidth - viewportPadding - tooltipWidth,
            ),
        );
        categoryTooltip = text;
        categoryTooltipStyle = [
            `top: calc(${rect.top}px + var(--tooltip-offset-top))`,
            `left: ${left}px`,
            `width: ${tooltipWidth}px`,
            "background: var(--tooltip-background)",
            "border-radius: var(--tooltip-border-radius)",
            "color: var(--tooltip-color)",
            "font-size: var(--tooltip-font-size)",
            "padding: var(--tooltip-padding)",
        ].join("; ");
    }

    function handleSubcategoryOverlayFocusOut(
        e: FocusEvent,
        category: SelectItem,
    ) {
        const nextTarget = e.relatedTarget;
        if (
            nextTarget instanceof Node &&
            (e.currentTarget as HTMLElement).contains(nextTarget)
        ) {
            return;
        }

        hideSubcategoryOverlay(category);
    }

    function subcategoryShortBadge(subcategory: Subcategory) {
        const shortName = displayCategoryShortName(subcategory, $locale);
        const label = displaySubcategoryLabel(subcategory, $locale, $_);

        if (shortName && shortName !== label) {
            return shortName.toUpperCase();
        }

        if (subcategory.short_name?.trim()) {
            return subcategory.short_name.trim().toUpperCase();
        }

        const normalizedLabel = label.trim();
        if (normalizedLabel.length <= 5) {
            return normalizedLabel.toUpperCase();
        }

        const words = normalizedLabel.match(/[\p{L}\p{N}]+/gu) ?? [];
        if (words.length > 1) {
            return words
                .map((word) => word.at(0))
                .join("")
                .slice(0, 5)
                .toUpperCase();
        }

        return normalizedLabel.slice(0, 4).toUpperCase();
    }

    function setAuthorFilter(item: SearchItem) {
        filter.author = item.value.id;
        update();
    }

    function setDifficultyFilter(difficulties: SelectItem[]) {
        filter.difficulty = difficulties.map((d) => d.value);
        update();
    }

    function setSharedFilter(e: Event) {
        filter.shared = (e.target as HTMLInputElement).checked;
        update();
    }

    function setLikedFilter(e: Event) {
        filter.liked = (e.target as HTMLInputElement).checked;
        update();
    }

    function setCompletedFilter(item: RadioItem) {
        switch (item.value) {
            case "no_preference":
                filter.completed = undefined;
                break;
            case "completed":
                filter.completed = true;
                break;
            case "not_completed":
                filter.completed = false;
                break;
            default:
                filter.completed = undefined;
                break;
        }

        update();
    }

    function setPrivateFilter(e: Event) {
        filter.private = (e.target as HTMLInputElement).checked;
        update();
    }

    function setPublicFilter(e: Event) {
        filter.public = (e.target as HTMLInputElement).checked;
        update();
    }

    async function searchCities(q: string) {
        if (q.length == 0) {
            filter.near.lat = undefined;
            filter.near.lon = undefined;
            update();

            return;
        }
        const r = await searchLocations(q, 5);

        searchDropdownItems = r.map((h) => ({
            text: h.name,
            description: h.description,
            value: h,
            icon: getIconForLocation(h),
        }));
    }

    function handleSearchClick(item: SearchItem) {
        citySearchQuery = item.text;
        filter.near.lat = item.value.lat;
        filter.near.lon = item.value.lon;

        update();
    }

    async function searchTags(q: string) {
        const result = await tags_index(q);
        tagItems = result.items.map((t) => ({ text: t.name, value: t }));
    }

    function getFilterTags(): ComboboxItem[] {
        return filter.tags.map((t) => ({ text: t, value: t }));
    }

    function setFilterTags(tags: ComboboxItem[]) {
        filter.tags = tags.map((t) => t.text);
        update();
    }

    function getVisibiltyStatus(): number {
        const isPublic = filter.public !== undefined && filter.public === true;
        const isPrivate =
            filter.private !== undefined && filter.private === true;

        if (isPublic === true && isPrivate === true) {
            return 2;
        } else if (isPublic === true) {
            return 1;
        } else {
            return 0;
        }
    }
</script>

<div class="trail-filter p-8 border border-input-border rounded-xl">
    {#if showTrailSearch}
        <div class="flex gap-2 items-center">
            <div class="basis-full">
                <Search
                    bind:value={filter.q}
                    onupdate={update}
                    placeholder="{$_('search-trails')}..."
                ></Search>
            </div>
            <button
                aria-label="Toggle filter"
                class="btn-icon md:hidden"
                onclick={() => (filterExpanded = !filterExpanded)}
                ><i class="fa fa-sliders"></i></button
            >
        </div>
    {/if}

    {#if filterExpanded}
        <div in:slide out:slide>
            {#if showTrailSearch}
                <hr class="my-4 border-separator" />
            {/if}
            <div>
                <p class="text-sm font-medium pb-2">{$_("categories")}</p>
                <div
                    class="flex gap-2 overflow-x-auto overflow-y-hidden pb-2"
                >
                    {#each categorySelectItems as category}
                        {@const selected = filter.category.includes(category.value)}
                        {@const hasSubcategories = $subcategories.some(
                            (subcategory) => subcategory.category === category.value,
                        )}
                        {@const selectedSubcategoriesForCategory = selectedSubcategoryIds.filter(
                            (id) =>
                                noSubcategoryFilterCategory(id) === category.value ||
                                $subcategories.some(
                                    (subcategory) =>
                                        subcategory.id === id &&
                                        subcategory.category === category.value,
                                ),
                        )}
                        {@const noSubcategorySelected = selectedSubcategoryIds.includes(
                            noSubcategoryFilterValue(category.value),
                        )}
                        {@const noSubcategoryInherited =
                            selected && selectedSubcategoriesForCategory.length === 0}
                        {@const noSubcategoryActive =
                            noSubcategorySelected || noSubcategoryInherited}
                        <div
                            class="relative shrink-0"
                            role="presentation"
                            onmouseenter={(e) =>
                                showSubcategoryOverlay(
                                    category,
                                    hasSubcategories,
                                    e.currentTarget,
                                )}
                            onmouseleave={() => hideSubcategoryOverlay(category)}
                            onfocusin={(e) =>
                                showSubcategoryOverlay(
                                    category,
                                    hasSubcategories,
                                    e.currentTarget,
                                )}
                            onfocusout={(e) =>
                                handleSubcategoryOverlayFocusOut(e, category)}
                            onpointerdown={(e) =>
                                startCategoryLongPress(
                                    e,
                                    category,
                                    hasSubcategories,
                                )}
                            onpointermove={moveCategoryLongPress}
                            onpointerup={handleCategoryPointerUp}
                            onpointercancel={clearCategoryLongPress}
                            oncontextmenu={(e) => {
                                if (suppressCategoryClick === category.value) {
                                    e.preventDefault();
                                }
                            }}
                        >
                            <button
                                type="button"
                                aria-label={category.text}
                                aria-pressed={selected}
                                class="relative flex h-10 w-10 items-center justify-center rounded-md border transition-colors focus:outline-none focus:ring-1 focus:ring-inset focus:ring-input-ring"
                                class:border-primary={selected}
                                class:bg-primary={selected}
                                class:text-white={selected}
                                class:border-input-border={!selected}
                                class:bg-input-background={!selected}
                                class:text-gray-500={!selected}
                                class:hover:bg-menu-item-background-hover={!selected}
                                onclick={(e) => handleCategoryClick(e, category)}
                            >
                                <i class="fa {category.icon} text-2xl"></i>
                                {#if selectedSubcategoriesForCategory.length > 0}
                                    <i
                                        class="fa fa-filter absolute left-1 top-1 text-[8px] text-content"
                                    ></i>
                                {/if}
                            </button>
                            {#if hoveredCategoryId === category.value && hoveredCategoryItem && hoveredSubcategories.length}
                                <div
                                    class="fixed z-20 min-w-max pt-1"
                                    style={subcategoryOverlayStyle}
                                >
                                    <div
                                        class="rounded-md border border-input-border bg-menu-background p-2 shadow-lg"
                                    >
                                        <p class="mb-2 text-xs font-medium text-gray-500">
                                            {hoveredCategoryItem.text}
                                        </p>
                                        <div class="flex items-center gap-2">
                                            <button
                                                type="button"
                                                aria-label={$_("no-subcategory")}
                                                aria-pressed={noSubcategoryActive}
                                                class="relative flex h-10 w-10 items-center justify-center rounded-md border transition-colors focus:outline-none focus:ring-1 focus:ring-inset focus:ring-input-ring"
                                                class:border-primary={noSubcategoryActive}
                                                class:bg-primary={noSubcategoryActive}
                                                class:text-white={noSubcategoryActive}
                                                class:opacity-70={noSubcategoryInherited}
                                                class:border-input-border={!noSubcategoryActive}
                                                class:bg-input-background={!noSubcategoryActive}
                                                class:text-gray-500={!noSubcategoryActive}
                                                class:hover:bg-menu-item-background-hover={!noSubcategoryActive}
                                                onmouseenter={(e) =>
                                                    showFilterTooltip(
                                                        $_("no-subcategory"),
                                                        e.currentTarget,
                                                    )}
                                                onmouseleave={hideFilterTooltip}
                                                onfocus={(e) =>
                                                    showFilterTooltip(
                                                        $_("no-subcategory"),
                                                        e.currentTarget,
                                                    )}
                                                onblur={hideFilterTooltip}
                                                onclick={() =>
                                                    toggleNoSubcategoryFilter(category)}
                                            >
                                                <i class="fa {category.icon} text-2xl"></i>
                                                <i
                                                    class="fa-regular fa-circle absolute -bottom-1 -right-1 rounded-full bg-background text-[10px] text-content"
                                                    class:text-white={noSubcategoryActive}
                                                ></i>
                                            </button>
                                            <div class="h-8 border-l border-separator"></div>
                                            {#each hoveredSubcategories as subcategory}
                                                {@const subcategorySelected = selectedSubcategoryIds.includes(subcategory.id)}
                                                {@const subcategoryInherited = selected && selectedSubcategoriesForCategory.length === 0}
                                                {@const subcategoryActive = subcategorySelected || subcategoryInherited}
                                                {@const subcategoryLabel = displaySubcategoryLabel(subcategory, $locale, $_)}
                                                {@const badge = subcategoryShortBadge(subcategory)}
                                                {@const badgeIcon = displaySubcategoryBadgeIcon(subcategory)}
                                                <button
                                                    type="button"
                                                    aria-label={subcategoryLabel}
                                                    aria-pressed={subcategoryActive}
                                                    class="relative flex h-10 w-10 items-center justify-center rounded-md border transition-colors focus:outline-none focus:ring-1 focus:ring-inset focus:ring-input-ring"
                                                    class:border-primary={subcategoryActive}
                                                    class:bg-primary={subcategoryActive}
                                                    class:text-white={subcategoryActive}
                                                    class:opacity-70={subcategoryInherited}
                                                    class:border-input-border={!subcategoryActive}
                                                    class:bg-input-background={!subcategoryActive}
                                                    class:text-gray-500={!subcategoryActive}
                                                    class:hover:bg-menu-item-background-hover={!subcategoryActive}
                                                    onmouseenter={(e) =>
                                                        showFilterTooltip(
                                                            subcategoryLabel,
                                                            e.currentTarget,
                                                        )}
                                                    onmouseleave={hideFilterTooltip}
                                                    onfocus={(e) =>
                                                        showFilterTooltip(
                                                            subcategoryLabel,
                                                            e.currentTarget,
                                                        )}
                                                    onblur={hideFilterTooltip}
                                                    onclick={() => toggleSubcategoryFilter(subcategory)}
                                                >
                                                    <i
                                                        class="fa {displaySubcategoryIcon(
                                                            subcategory,
                                                            hoveredCategoryItem,
                                                        )} text-2xl"
                                                    ></i>
                                                    {#if badgeIcon}
                                                        <i
                                                            class="fa {badgeIcon} absolute right-0.5 top-0.5 text-[10px] text-gray-500"
                                                            class:text-white={subcategoryActive}
                                                        ></i>
                                                    {/if}
                                                    {#if badge}
                                                        <span
                                                            class="absolute -bottom-1 -right-1 max-w-10 truncate rounded-sm border border-input-border bg-background px-0.5 text-[7px] font-semibold leading-3 text-content"
                                                        >
                                                            {badge}
                                                        </span>
                                                    {/if}
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
                {#if categoryTooltip}
                    <div
                        class="fixed z-30 pointer-events-none whitespace-nowrap"
                        style={categoryTooltipStyle}
                    >
                        {categoryTooltip}
                    </div>
                {/if}
            </div>
            {#if explicitExcludedSearchCategories.length}
                <div
                    class="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-200"
                >
                    <i class="fa fa-warning mr-2"></i>
                    {$_("category-filter-exclude-search-override", {
                        values: {
                            categories:
                                explicitExcludedSearchCategories.join(", "),
                        },
                    })}
                </div>
            {/if}
            <hr class="my-4 border-separator" />
            <Combobox
                bind:value={getFilterTags, setFilterTags}
                onupdate={searchTags}
                placeholder={`${$_("filter-tags")}...`}
                items={tagItems}
                label={$_("tags")}
                multiple
                chips
            ></Combobox>
            <hr class="my-4 border-separator" />

            {#if $currentUser}
                <ActorSearch
                    onclick={(item) => setAuthorFilter(item)}
                    onclear={() => {
                        filter.author = "";
                        update();
                    }}
                    clearAfterSelect={false}
                    label={$_("author")}
                ></ActorSearch>
                <hr class="my-4 border-separator" />

                <p class="text-sm font-medium">{$_("visibilty-status")}</p>

                <div class="flex items-center mt-2 mb-4">
                    <input
                        id="private-checkbox"
                        type="checkbox"
                        checked={filter.private}
                        class="w-4 h-4 bg-input-background accent-primary border-input-border focus:ring-input-ring focus:ring-2"
                        onchange={setPrivateFilter}
                    />

                    <label for="private-checkbox" class="ms-2 text-sm"
                        >{$_("private")}</label
                    >
                </div>
                <div class="flex items-center my-4">
                    <input
                        id="public-checkbox"
                        type="checkbox"
                        checked={filter.public}
                        class="w-4 h-4 bg-input-background accent-primary border-input-border focus:ring-input-ring focus:ring-2"
                        onchange={setPublicFilter}
                    />
                    <label for="public-checkbox" class="ms-2 text-sm"
                        >{$_("public")}</label
                    >
                </div>
                <div class="flex items-center my-4">
                    <input
                        id="shared-checkbox"
                        type="checkbox"
                        checked={filter.shared}
                        class="w-4 h-4 bg-input-background accent-primary border-input-border focus:ring-input-ring focus:ring-2"
                        onchange={setSharedFilter}
                    />
                    <label for="shared-checkbox" class="ms-2 text-sm"
                        >{$_("shared")}</label
                    >
                </div>

                <hr class="my-4 border-separator" />
            {/if}
            <MultiSelect
                onchange={(value) => setDifficultyFilter(value)}
                label={$_("difficulty")}
                items={difficultyItems}
                placeholder={`${$_("filter-difficulty")}...`}
            ></MultiSelect>
            <hr class="my-4 border-separator" />
            {#if showCitySearch}
                <div class="mb-8">
                    <Search
                        items={searchDropdownItems}
                        label={$_("near")}
                        placeholder="{$_('search-places')}..."
                        clearAfterSelect={false}
                        bind:value={citySearchQuery}
                        onupdate={(q) => searchCities(q)}
                        onclick={(item) => handleSearchClick(item)}
                    ></Search>
                </div>
                <Slider
                    maxValue={10000}
                    bind:currentValue={filter.near.radius}
                    onset={() => update()}
                ></Slider>
                <p>
                    <span class="text-gray-500 text-sm">{$_("radius")}:</span>
                    {formatDistance(filter.near.radius)}
                </p>
                <hr class="my-4 border-separator" />
            {/if}
            <p class="text-sm font-medium pb-4">{$_("distance")}</p>
            <DoubleSlider
                minValue={filter.distanceMin}
                maxValue={filter.distanceLimit}
                bind:currentMin={filter.distanceMin}
                bind:currentMax={filter.distanceMax}
                onset={() => update()}
            ></DoubleSlider>
            <div class="flex justify-between">
                <span>{formatDistance(filter.distanceMin)}</span>
                <span
                    >{formatDistance(filter.distanceMax)}{filter.distanceMax ==
                    filter.distanceLimit
                        ? "+"
                        : ""}</span
                >
            </div>
            <hr class="my-4 border-separator" />
            <p class="text-sm font-medium pb-4">{$_("elevation-gain")}</p>
            <DoubleSlider
                minValue={filter.elevationGainMin}
                maxValue={filter.elevationGainLimit}
                bind:currentMin={filter.elevationGainMin}
                bind:currentMax={filter.elevationGainMax}
                onset={() => update()}
            ></DoubleSlider>
            <div class="flex justify-between">
                <span>{formatElevation(filter.elevationGainMin)}</span>
                <span
                    >{formatElevation(
                        filter.elevationGainMax,
                    )}{filter.elevationGainMax == filter.elevationGainLimit
                        ? "+"
                        : ""}</span
                >
            </div>
            <hr class="my-4 border-separator" />
            <p class="text-sm font-medium pb-4">{$_("elevation-loss")}</p>
            <DoubleSlider
                minValue={filter.elevationLossMin}
                maxValue={filter.elevationLossLimit}
                bind:currentMin={filter.elevationLossMin}
                bind:currentMax={filter.elevationLossMax}
                onset={() => update()}
            ></DoubleSlider>
            <div class="flex justify-between">
                <span>{formatElevation(filter.elevationLossMin)}</span>
                <span
                    >{formatElevation(
                        filter.elevationLossMax,
                    )}{filter.elevationLossMax == filter.elevationLossLimit
                        ? "+"
                        : ""}</span
                >
            </div>
            <hr class="my-4 border-separator" />

            <div class="space-y-2">
                <Datepicker
                    name="startDate"
                    label={$_("after")}
                    bind:value={filter.startDate}
                    onchange={update}
                ></Datepicker>
                <Datepicker
                    name="endDate"
                    label={$_("before")}
                    bind:value={filter.endDate}
                    onchange={update}
                ></Datepicker>
            </div>
            <hr class="my-4 border-separator" />
            <p class="text-sm font-medium pb-4">{$_("like-status")}</p>
            <input
                id="liked-checkbox"
                type="checkbox"
                checked={filter.liked}
                class="w-4 h-4 bg-input-background accent-primary border-input-border focus:ring-input-ring focus:ring-2"
                onchange={setLikedFilter}
            />
            <label for="liked-checkbox" class="ms-2 text-sm"
                >{$_("liked")}</label
            >
            <hr class="my-4 border-separator" />
            <p class="text-sm font-medium pb-4">{$_("completion-status")}</p>
            <RadioGroup
                name="completed"
                items={radioGroupCompletenessItems}
                selected={filter.completed === undefined
                    ? 2
                    : filter.completed === true
                      ? 0
                      : 1}
                onchange={(item) => setCompletedFilter(item)}
            ></RadioGroup>
        </div>
    {/if}
</div>
