<script lang="ts">
  import type { AppSettings, AppSnapshot } from '../../../shared/types'
  import { Separator } from '$lib/components/ui/separator'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import {
    Field,
    FieldContent,
    FieldGroup,
    FieldLabel,
    FieldSet,
    FieldLegend
  } from '$lib/components/ui/field'
  import { autoCustomTaskCategoryColor } from '../../../shared/off-task-colors'

  let {
    settings = $bindable(),
    isBusy = false,
    saveSettings,
    pullCalendar,
    snapshot = null
  }: {
    settings: AppSettings
    isBusy?: boolean
    saveSettings: () => Promise<void>
    pullCalendar: () => Promise<void>
    snapshot?: AppSnapshot | null
  } = $props()

  const addCategory = (): void => {
    const index = settings.customTaskCategories.length
    settings = {
      ...settings,
      customTaskCategories: [
        ...settings.customTaskCategories,
        { name: '', bookingCode: '', color: autoCustomTaskCategoryColor('', index) }
      ]
    }
  }

  const removeCategory = (index: number): void => {
    settings = {
      ...settings,
      customTaskCategories: settings.customTaskCategories.filter((_, i) => i !== index)
    }
  }

  const weekdays: Array<{ key: keyof AppSettings['workingHours']; label: string }> = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ]

  const updateLunchDuration = (dayKey: keyof AppSettings['workingHours'], rawValue: string): void => {
    const parsed = Number.parseInt(rawValue, 10)
    const lunchDurationMins =
      rawValue.trim() === '' || Number.isNaN(parsed)
        ? undefined
        : Math.max(0, Math.min(240, Math.round(parsed)))

    settings = {
      ...settings,
      workingHours: {
        ...settings.workingHours,
        [dayKey]: {
          ...settings.workingHours[dayKey],
          lunchDurationMins
        }
      }
    }
  }
</script>

<FieldSet>
  <FieldLegend>Jira</FieldLegend>
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
        <FieldLabel for="jiraToken">API Token</FieldLabel>
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

<Separator />

<FieldSet>
  <FieldLegend>Working Hours</FieldLegend>
  <FieldGroup>
    <p class="text-muted-foreground text-sm">
      These start/end times are used for active task duration calculations and weekly background
      task overlays.
    </p>
    <div class="grid gap-2">
      <div class="grid grid-cols-[140px_1fr_1fr_1fr] gap-2 text-sm font-medium">
        <span>Day</span>
        <span>Start</span>
        <span>End</span>
        <span>Lunch (min)</span>
      </div>
      {#each weekdays as day (day.key)}
        <div class="grid grid-cols-[140px_1fr_1fr_1fr] items-center gap-2">
          <span class="text-sm">{day.label}</span>
          <Input type="time" bind:value={settings.workingHours[day.key].start} />
          <Input type="time" bind:value={settings.workingHours[day.key].end} />
          <Input
            type="number"
            min="0"
            max="240"
            placeholder="60"
            value={settings.workingHours[day.key].lunchDurationMins ?? ''}
            oninput={(e) => {
              updateLunchDuration(day.key, (e.currentTarget as HTMLInputElement).value)
            }}
          />
        </div>
      {/each}
    </div>
  </FieldGroup>
</FieldSet>

<Separator />

<FieldSet>
  <FieldLegend>Custom Task</FieldLegend>
  <FieldGroup>
    <div class="grid grid-cols-[1fr_1fr_120px_auto] gap-2">
      <FieldLabel>Category</FieldLabel>
      <FieldLabel>Booking Code</FieldLabel>
      <FieldLabel>Color</FieldLabel>
      <span></span>
    </div>
    {#each settings.customTaskCategories as _cat, i (`cat-${i}`)}
      <Field>
        <FieldContent>
          <div class="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-center">
            <Input placeholder="e.g. training" bind:value={settings.customTaskCategories[i].name} />
            <Input
              placeholder="e.g. ADMIN-001"
              bind:value={settings.customTaskCategories[i].bookingCode}
            />
            <Input type="color" bind:value={settings.customTaskCategories[i].color} />
            <Button variant="ghost" size="icon" onclick={() => removeCategory(i)}>✕</Button>
          </div>
        </FieldContent>
      </Field>
    {/each}
    <Button variant="outline" class="w-full" onclick={addCategory}>+ Add Category</Button>
  </FieldGroup>
</FieldSet>

<FieldSet>
  <FieldContent>
    <Button class="w-full" disabled={isBusy} onclick={saveSettings}>Save Settings</Button>
  </FieldContent>
</FieldSet>
