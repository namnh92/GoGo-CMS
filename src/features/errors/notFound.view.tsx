import { Link } from 'react-router-dom'
import { useT } from '@/shared/i18n/i18n'
import { styles } from './notFound.style'

export default function NotFoundScreen() {
  const t = useT()
  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>{t('state.notFound')}</h1>
        <p className={styles.hint}>{t('state.notFoundHint')}</p>
        <div className={styles.action}>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-compact bg-coral px-4 text-sm font-semibold text-text-on-accent"
          >
            {t('state.backToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  )
}
