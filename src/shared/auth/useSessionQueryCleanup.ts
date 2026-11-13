import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/** Cancel old replies and discard sensitive data when a session leaves a screen. */
export function useSessionQueryCleanup(prefix: string, epoch: number, clear = false) {
  const client = useQueryClient()
  useEffect(() => {
    const discard = () => {
      const queryKey = [prefix, epoch]
      void client.cancelQueries({ queryKey })
      client.removeQueries({ queryKey })
    }
    if (clear) discard()
    return discard
  }, [client, prefix, epoch, clear])
}
