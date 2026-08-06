const storageKey = 'clipnote:credentials:v1'

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

function loadCredentials(): Credential[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Credential[]
  } catch {
    return []
  }
}

function saveCredentials(credentials: Credential[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(storageKey, JSON.stringify(credentials))
}

export async function listCredentials(): Promise<CredentialSummary[]> {
  const credentials = loadCredentials()
  return credentials.map(({ password: _, ...rest }) => rest)
}

export async function getCredential(id: string): Promise<Credential> {
  const credentials = loadCredentials()
  const found = credentials.find((c) => c.id === id)
  if (!found) throw new Error('Credential not found.')
  return found
}

export async function saveCredential(credential: Credential): Promise<CredentialSummary> {
  const credentials = loadCredentials()
  const idx = credentials.findIndex((c) => c.id === credential.id)
  if (idx >= 0) credentials[idx] = credential
  else credentials.push(credential)
  saveCredentials(credentials)
  const { password: _, ...rest } = credential
  return rest
}

export async function deleteCredential(id: string): Promise<void> {
  const credentials = loadCredentials()
  saveCredentials(credentials.filter((c) => c.id !== id))
}
