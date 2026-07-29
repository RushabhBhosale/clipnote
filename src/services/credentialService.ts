import { invoke } from '@tauri-apps/api/core'

export interface CredentialSummary {
  id: string
  label: string
  url: string
  username: string
  updatedAt: string
}

export interface Credential extends CredentialSummary {
  password: string
}

function requireDesktop() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('Credentials are available in the macOS app.')
  }
}

export async function listCredentials() {
  requireDesktop()
  return invoke<CredentialSummary[]>('credentials_list')
}

export async function getCredential(id: string) {
  requireDesktop()
  return invoke<Credential>('credential_get', { id })
}

export async function saveCredential(credential: Credential) {
  requireDesktop()
  return invoke<CredentialSummary>('credential_save', { credential })
}

export async function deleteCredential(id: string) {
  requireDesktop()
  await invoke('credential_delete', { id })
}
