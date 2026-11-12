import { useController, type UseFormReturn } from 'react-hook-form'
import { useLabel, useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/Field'
import { EVIDENCE_REFERENCE_MAX, useEvidenceError } from './contactEvidence'
import { ALIAS_LIMIT, aliasesChanged, placeAliasesSchema } from './placeAliases'
import type { PlaceIdentityForm } from './placeForm'
import { styles } from './placeAliases.style'

export function PlaceAliasesFields({
  form,
  baseline,
  readOnly,
  disabled,
}: {
  form: UseFormReturn<PlaceIdentityForm>
  baseline?: string[]
  readOnly: boolean
  disabled: boolean
}) {
  const t = useT()
  const label = useLabel()
  const describeEvidence = useEvidenceError()
  const { field } = useController({ control: form.control, name: 'aliases' })
  const { field: draft } = useController({ control: form.control, name: 'aliasDraft' })
  const aliases = field.value ?? []
  const errors = form.formState.errors
  const change = (next: string[]) => {
    form.clearErrors('aliases')
    field.onChange(next)
  }
  const add = () => {
    const parsed = placeAliasesSchema.safeParse([...aliases, draft.value ?? ''])
    if (!parsed.success) {
      form.setError('aliasDraft', { type: 'custom', message: parsed.error.issues[0]!.message })
      return
    }
    change([...aliases, (draft.value ?? '').trim()])
    draft.onChange('')
    form.clearErrors('aliasDraft')
  }
  const evidenceError = (property: 'sourceReference' | 'collectedAt') => {
    const issue = errors.aliasProvenance?.[property] ?? errors.aliasProvenance?.sourceType
    return issue
      ? describeEvidence({ code: String(issue.type), message: issue.message })
      : undefined
  }
  const issue = errors.aliasDraft ?? errors.aliases
  return (
    <fieldset className={styles.fieldset} aria-label={t('placeAliases.label')}>
      <legend className={styles.legend}>{t('placeAliases.label')}</legend>
      <p className={styles.hint}>{t(readOnly ? 'placeAliases.readOnly' : 'placeAliases.hint')}</p>
      {aliases.length ? (
        <ul className={styles.chips} aria-label={t('placeAliases.label')}>
          {aliases.map((alias, index) => (
            <li className={styles.chip} key={`${index}:${alias}`}>
              <span className={styles.chipText} title={alias}>
                {alias}
              </span>
              {!readOnly ? (
                <Button
                  variant="ghost"
                  disabled={disabled}
                  aria-label={t('placeAliases.remove', { alias })}
                  onClick={() => change(aliases.filter((_, i) => i !== index))}
                >
                  ×
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>{t('placeAliases.empty')}</p>
      )}
      {!readOnly ? (
        <>
          <div className={styles.row}>
            <TextInput
              {...draft}
              value={draft.value ?? ''}
              className={styles.input}
              label={t('placeAliases.new')}
              disabled={disabled || aliases.length >= ALIAS_LIMIT}
              error={issue ? label(issue.message ?? '', t('placeAliases.invalid')) : undefined}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  add()
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={disabled || aliases.length >= ALIAS_LIMIT || !draft.value}
              onClick={add}
            >
              {t('placeAliases.add')}
            </Button>
          </div>
          {aliasesChanged(aliases, baseline) ? (
            <div className={styles.evidence}>
              <TextInput
                label={t('placeAliases.source')}
                hint={t('placeAliases.sourceHint')}
                aria-required="true"
                maxLength={EVIDENCE_REFERENCE_MAX}
                disabled={disabled}
                error={evidenceError('sourceReference')}
                {...form.register('aliasProvenance.sourceReference')}
              />
              <TextInput
                label={t('placeAliases.collectedAt')}
                type="datetime-local"
                aria-required="true"
                disabled={disabled}
                error={evidenceError('collectedAt')}
                {...form.register('aliasProvenance.collectedAt')}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </fieldset>
  )
}
