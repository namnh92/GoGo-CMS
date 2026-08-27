import { PermissionDeniedState } from '@/shared/ui/State'
import { styles } from './forbidden.style'

export default function ForbiddenScreen() {
  return (
    <div className={styles.root}>
      <PermissionDeniedState />
    </div>
  )
}
