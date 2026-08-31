import { useT } from '@/shared/i18n/i18n'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import type { SafetyRuleType } from '@/shared/api/contracts'
import {
  CONDITION_FIELDS,
  type ConditionDraft,
  type ConditionError,
  type ConditionField,
} from './conditions'
import { styles } from './safetyRule.style'

/**
 * The condition editor: one typed control per field the rule type declares.
 *
 * Deliberately not a rule builder and not a JSON box. The fields, their
 * bounds and their defaults come from `conditions.ts`, so the form can only
 * express rules the backend already knows how to evaluate — and an editor
 * sees the bound before the 400, not after it.
 */
export function ConditionFields({
  ruleType,
  draft,
  errors,
  disabled,
  onChange,
}: {
  ruleType: SafetyRuleType
  draft: ConditionDraft
  errors: ConditionError[]
  disabled?: boolean
  onChange: (name: string, value: string | boolean) => void
}) {
  const t = useT()

  const messageFor = (name: string): string | undefined => {
    const found = errors.find((error) => error.field === name)
    return found ? t(`safety.condition.error.${found.code}` as const) : undefined
  }

  const renderField = (field: ConditionField) => {
    const label = t(`safety.condition.${field.name}` as const)
    const error = messageFor(field.name)

    if (field.kind === 'boolean') {
      // A select rather than a switch: it sits in a grid of labelled fields,
      // and `Toggle` carries its name only in `aria-label`, which would leave
      // this one control visually unlabelled among the rest.
      return (
        <Select
          key={field.name}
          label={label}
          disabled={disabled}
          value={draft[field.name] === true ? 'true' : 'false'}
          onChange={(event) => onChange(field.name, event.target.value === 'true')}
        >
          <option value="true">{t('safety.condition.yes')}</option>
          <option value="false">{t('safety.condition.no')}</option>
        </Select>
      )
    }

    if (field.kind === 'terms') {
      return (
        <TextArea
          key={field.name}
          label={label}
          rows={5}
          className={styles.formFull}
          // One per line rather than comma-separated: a term may contain a
          // comma, and nothing here should quietly split a phrase in half.
          hint={t('safety.condition.termsHint', { max: field.maxTerms })}
          required={field.required}
          error={error}
          disabled={disabled}
          value={typeof draft[field.name] === 'string' ? (draft[field.name] as string) : ''}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      )
    }

    if (field.kind === 'enum') {
      return (
        <Select
          key={field.name}
          label={label}
          required={field.required}
          error={error}
          disabled={disabled}
          value={typeof draft[field.name] === 'string' ? (draft[field.name] as string) : ''}
          onChange={(event) => onChange(field.name, event.target.value)}
        >
          {/* An empty option only where the server has a default to fall back on. */}
          {field.required ? null : <option value="">{t('safety.condition.useDefault')}</option>}
          {field.options.map((option) => (
            <option key={option} value={option}>
              {t(`safety.condition.option.${option}` as const)}
            </option>
          ))}
        </Select>
      )
    }

    return (
      <TextInput
        key={field.name}
        label={label}
        inputMode="numeric"
        required={field.required}
        // The default is shown as a placeholder, never written into the value:
        // "left blank" and "typed the default" must stay distinguishable.
        placeholder={
          field.fallback === undefined
            ? t('safety.condition.range', { min: field.min, max: field.max })
            : t('safety.condition.default', { value: field.fallback })
        }
        hint={t('safety.condition.range', { min: field.min, max: field.max })}
        error={error}
        disabled={disabled}
        value={typeof draft[field.name] === 'string' ? (draft[field.name] as string) : ''}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    )
  }

  return <>{CONDITION_FIELDS[ruleType].map(renderField)}</>
}
