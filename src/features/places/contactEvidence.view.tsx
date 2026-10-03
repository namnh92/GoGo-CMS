import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { useT, type MessageKey } from '@/shared/i18n/i18n'
import { Select, TextInput } from '@/shared/ui/Field'
import {
  EVIDENCE_REFERENCE_MAX,
  EVIDENCE_SOURCE_TYPES,
  type ContactField,
  type EvidenceProperty,
} from './contactEvidence'
import { styles } from './contactEvidence.style'

const FIELD_LABEL: Record<ContactField, MessageKey> = {
  addressText: 'placeEditor.address',
  phone: 'placeEditor.phone',
  website: 'placeEditor.website',
}

/**
 * GoGo-BE#280 — the three boxes that make a contact value GoGo's: what kind of
 * source, which source, and when it was gathered.
 *
 * Rendered only for a value that is actually being written, so an editor who
 * saves a description is never asked to re-prove a phone nobody touched.
 * The boxes are `aria-required`, not `required`: a native constraint would
 * block the submit before the form's own checks name what is missing.
 * Binding is the caller's: the place editor hands in `register`, the review
 * drawer hands in controlled `value`/`onChange` — one look, two form models.
 */
export function ContactEvidenceFields({
  field,
  idPrefix,
  bind,
  error,
  disabled,
}: {
  field: ContactField
  idPrefix: string
  bind: (
    property: EvidenceProperty,
  ) => InputHTMLAttributes<HTMLInputElement> & SelectHTMLAttributes<HTMLSelectElement>
  error: (property: EvidenceProperty) => string | undefined
  disabled?: boolean
}) {
  const t = useT()
  const id = `${idPrefix}-${field}-evidence`
  return (
    <fieldset className={styles.fieldset} aria-describedby={`${id}-hint`}>
      <legend className={styles.legend}>
        <span aria-hidden="true">⚑</span>
        {t('contactEvidence.legend', { field: t(FIELD_LABEL[field]) })}
      </legend>
      <p id={`${id}-hint`} className={styles.hint}>
        {t('contactEvidence.hint')}
      </p>
      <div className={styles.row}>
        <Select
          id={`${id}-type`}
          label={t('contactEvidence.sourceType')}
          aria-required="true"
          disabled={disabled}
          error={error('sourceType')}
          {...(bind('sourceType') as SelectHTMLAttributes<HTMLSelectElement>)}
        >
          <option value="">{t('contactEvidence.sourceTypePlaceholder')}</option>
          {EVIDENCE_SOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`contactEvidence.type.${type}`)}
            </option>
          ))}
        </Select>
        <TextInput
          id={`${id}-reference`}
          label={t('contactEvidence.sourceReference')}
          hint={t('contactEvidence.sourceReferenceHint')}
          aria-required="true"
          maxLength={EVIDENCE_REFERENCE_MAX}
          disabled={disabled}
          error={error('sourceReference')}
          {...(bind('sourceReference') as InputHTMLAttributes<HTMLInputElement>)}
        />
        <TextInput
          id={`${id}-collected`}
          label={t('contactEvidence.collectedAt')}
          type="datetime-local"
          aria-required="true"
          disabled={disabled}
          error={error('collectedAt')}
          {...(bind('collectedAt') as InputHTMLAttributes<HTMLInputElement>)}
        />
      </div>
    </fieldset>
  )
}
