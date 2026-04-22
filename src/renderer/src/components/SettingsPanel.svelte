<script lang="ts">
  import type { AppSettings } from '../../../shared/types'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import * as Sidebar from '$lib/components/ui/sidebar'
  import * as Table from '$lib/components/ui/table'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import {
    addCustomTaskCategory,
    removeCustomTaskCategoryAt,
    SETTINGS_WEEKDAYS,
    updateWorkingDayLunchDuration
  } from '$lib/helpers/settings-panel'
  import {
    Field,
    FieldContent,
    FieldGroup,
    FieldLabel,
    FieldSet,
    FieldLegend
  } from '$lib/components/ui/field'

  type SettingsCategory = 'jira' | 'working-hours' | 'custom-task'

  let {
    settings = $bindable(),
    isBusy = false,
    saveSettings
  }: {
    settings: AppSettings
    isBusy?: boolean
    saveSettings: () => Promise<void>
  } = $props()

  const weekdays = SETTINGS_WEEKDAYS

  const settingsCategories: Array<{ id: SettingsCategory; label: string; description: string }> = [
    {
      id: 'jira',
      label: 'Jira',
      description: 'Connection details and booking code field mapping.'
    },
    {
      id: 'working-hours',
      label: 'Working Hours',
      description: 'Daily schedule used for duration calculations and overlays.'
    },
    {
      id: 'custom-task',
      label: 'Custom Task',
      description: 'Manage custom task categories, booking codes, and colors.'
    }
  ]

  let activeCategory = $state<SettingsCategory>('jira')

  const serializeSettings = (value: AppSettings): string => JSON.stringify(value)

  let lastBoundSettingsRef = $state<AppSettings | null>(null)
  let lastSavedSnapshot = $state('')

  $effect(() => {
    if (settings === lastBoundSettingsRef) return
    lastBoundSettingsRef = settings
    lastSavedSnapshot = serializeSettings(settings)
  })

  const hasUnsavedChanges = $derived(serializeSettings(settings) !== lastSavedSnapshot)

  const activeCategoryMeta = $derived(
    settingsCategories.find((category) => category.id === activeCategory) ?? settingsCategories[0]
  )
</script>

<Sidebar.Provider
  class="h-full min-h-0"
  style="--sidebar-width: 12rem; --sidebar-width-mobile: 12rem;"
>
  <div class="flex h-full min-h-0 w-full gap-4 md:gap-6">
    <Sidebar.Root collapsible="none" class="h-full border-r">
      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.Header>
            <span class="text-lg"> Settings </span></Sidebar.Header
          >
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              {#each settingsCategories as category (category.id)}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton
                    isActive={activeCategory === category.id}
                    onclick={() => {
                      activeCategory = category.id
                    }}
                  >
                    <span>{category.label}</span>
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        </Sidebar.Group>
      </Sidebar.Content>
      <Sidebar.Footer>
        <Button class="w-full" disabled={isBusy || !hasUnsavedChanges} onclick={saveSettings}>
          Save changes
        </Button>
      </Sidebar.Footer>
    </Sidebar.Root>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto pr-8 pt-12">
      <div>
        <h3 class="text-base font-semibold">{activeCategoryMeta.label}</h3>
        <p class="text-muted-foreground text-sm">{activeCategoryMeta.description}</p>
      </div>

      {#if activeCategory === 'jira'}
        <FieldSet>
          <FieldLegend class="sr-only">Jira</FieldLegend>
          <FieldGroup>
            <div class="grid gap-3 sm:grid-cols-2">
              <Field class="sm:col-span-2">
                <FieldLabel for="jiraBaseUrl">Base URL</FieldLabel>
                <FieldContent>
                  <Input
                    id="jiraBaseUrl"
                    placeholder="https://yourcompany.atlassian.net"
                    bind:value={settings.jiraBaseUrl}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel for="jiraEmail">Email</FieldLabel>
                <FieldContent>
                  <Input id="jiraEmail" type="email" bind:value={settings.jiraEmail} />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel for="jiraToken" class="inline-flex items-center gap-2">
                  API Token
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="How to generate a Jira API token"
                        >
                          ?
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content class="max-w-72 text-sm">
                        <p>
                          Create an Atlassian API token at id.atlassian.com - Security - API tokens,
                          then paste it here.
                        </p>
                      </Tooltip.Content>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                </FieldLabel>
                <FieldContent>
                  <Input id="jiraToken" type="password" bind:value={settings.jiraApiToken} />
                </FieldContent>
              </Field>
              <Field class="sm:col-span-2">
                <FieldLabel for="bookingField">Booking Code Field</FieldLabel>
                <FieldContent>
                  <Input
                    id="bookingField"
                    placeholder="customfield_10001"
                    bind:value={settings.jiraBookingCodeField}
                  />
                </FieldContent>
              </Field>
            </div>
          </FieldGroup>
        </FieldSet>
      {:else if activeCategory === 'working-hours'}
        <FieldSet>
          <FieldLegend class="sr-only">Working Hours</FieldLegend>
          <FieldGroup>
            <p class="text-muted-foreground text-sm">
              These start/end times are used for active task duration calculations and weekly
              background task overlays.
            </p>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Day</Table.Head>
                  <Table.Head>Start</Table.Head>
                  <Table.Head>End</Table.Head>
                  <Table.Head>Lunch (min)</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each weekdays as day (day.key)}
                  <Table.Row>
                    <Table.Cell class="font-medium">{day.label}</Table.Cell>
                    <Table.Cell>
                      <Input type="time" bind:value={settings.workingHours[day.key].start} />
                    </Table.Cell>
                    <Table.Cell>
                      <Input type="time" bind:value={settings.workingHours[day.key].end} />
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        type="number"
                        min="0"
                        max="240"
                        placeholder="60"
                        value={settings.workingHours[day.key].lunchDurationMins ?? ''}
                        oninput={(e) => {
                          settings = updateWorkingDayLunchDuration(
                            settings,
                            day.key,
                            (e.currentTarget as HTMLInputElement).value
                          )
                        }}
                      />
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </FieldGroup>
        </FieldSet>
      {:else}
        <FieldSet>
          <FieldLegend class="sr-only">Custom Task</FieldLegend>
          <FieldGroup class="min-h-0">
            <div class="max-h-[18rem] overflow-y-auto">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Category</Table.Head>
                    <Table.Head>Booking Code</Table.Head>
                    <Table.Head>Color</Table.Head>
                    <Table.Head></Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each settings.customTaskCategories as cat, i (`cat-${i}`)}
                    <Table.Row>
                      <Table.Cell>
                        <Input placeholder="e.g. training" bind:value={cat.name} />
                      </Table.Cell>
                      <Table.Cell>
                        <Input placeholder="e.g. ADMIN-001" bind:value={cat.bookingCode} />
                      </Table.Cell>
                      <Table.Cell>
                        <Input type="color" bind:value={cat.color} />
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onclick={() => {
                            settings = removeCustomTaskCategoryAt(settings, i)
                          }}>x</Button
                        >
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
            <Button
              variant="outline"
              class="w-full"
              onclick={() => {
                settings = addCustomTaskCategory(settings)
              }}>+ Add Category</Button
            >
          </FieldGroup>
        </FieldSet>
      {/if}
    </div>
  </div>
</Sidebar.Provider>
