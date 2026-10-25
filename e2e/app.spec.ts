import { expect, test, type Page } from '@playwright/test'

const vaultKey = process.env.E2E_VAULT_KEY!
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024
/** Both projects share one server database, so item names must be unique per test run. */
const uniq = (name: string) => `${name} ${test.info().project.name}${test.info().repeatEachIndex}${test.info().retry}`

/** Opens the app as a freshly paired device. */
async function pair(page: Page) {
  await page.goto(`/#pair=${vaultKey}`)
  await expect(page.getByRole('heading', { name: 'Get It Done' })).toBeVisible()
  // The pairing link is consumed and removed from the address bar.
  await expect(page).not.toHaveURL(/#pair=/)
}

async function add(page: Page, text: string) {
  await page.getByLabel('Add items').fill(text)
  await page.getByLabel('Add items').press('Enter')
}

/** On phones only one list shows at a time. */
async function showList(page: Page, list: 'Groceries' | 'To-dos') {
  if (!isDesktop(page)) await page.getByRole('tab', { name: new RegExp(list) }).click()
}

async function openItem(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Edit item' })).toBeVisible()
}

test('a new device sees the lock screen and can pair with a link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Set up this device' })).toBeVisible()
  await page.getByRole('button', { name: 'Pair with a link' }).click()
  await page.getByLabel('Pairing link or vault key').fill(`https://anything/#pair=${vaultKey}`)
  await page.getByRole('button', { name: 'Pair this device' }).click()
  await expect(page.getByRole('heading', { name: 'Get It Done' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 10_000 })
})

test('pairs from a link opened in a tab already showing the lock screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Set up this device' })).toBeVisible()
  // Same page, only the hash changes: the browser doesn't reload.
  await page.evaluate((key) => (location.hash = `#pair=${key}`), vaultKey)
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 10_000 })
  await expect(page).not.toHaveURL(/#pair=/)
})

test('rejects a bad pairing link', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pair with a link' }).click()
  await page.getByLabel('Pairing link or vault key').fill('not a link')
  await page.getByRole('button', { name: 'Pair this device' }).click()
  await expect(page.getByText('isn’t a pairing link')).toBeVisible()
})

test('adds items and sorts them into groceries and to-dos', async ({ page }) => {
  await pair(page)
  await add(page, 'milk, bananas, call plumber')
  await showList(page, 'Groceries')
  await expect(page.getByRole('region', { name: 'Dairy & eggs' }).getByRole('button', { name: 'milk', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Produce' }).getByRole('button', { name: 'bananas', exact: true }).first()).toBeVisible()
  await showList(page, 'To-dos')
  await expect(page.getByRole('button', { name: 'call plumber', exact: true }).first()).toBeVisible()
})

test('checks items off, and deletes with undo', async ({ page }) => {
  await pair(page)
  const checkMe = uniq('check me')
  const deleteMe = uniq('delete me')
  await add(page, `${checkMe}, ${deleteMe}`)
  await showList(page, 'To-dos')

  await page.getByRole('checkbox', { name: `Check ${checkMe}` }).click()
  await expect(page.getByRole('button', { name: /^Done/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: checkMe, exact: true })).toBeHidden()

  await openItem(page, deleteMe)
  await page.getByRole('button', { name: 'Delete item' }).click()
  await expect(page.getByText(`Deleted “${deleteMe}”`)).toBeVisible()
  await expect(page.getByRole('button', { name: deleteMe, exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: deleteMe, exact: true })).toBeVisible()
})

test('sets a deadline from a preset and shows it on the row', async ({ page }) => {
  await pair(page)
  const passport = uniq('renew passport')
  await add(page, passport)
  await showList(page, 'To-dos')
  await openItem(page, passport)
  await page.getByRole('button', { name: 'Tomorrow 9am' }).first().click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listitem').filter({ hasText: passport }).getByText('Tomorrow 9am')).toBeVisible()
})

test('understands times and priority typed in the add bar', async ({ page }) => {
  await pair(page)
  const name = uniq('wash shoe')
  await page.getByLabel('Add items').fill(`${name} tomorrow urgent, remind at 6pm`)
  // The preview shows what was understood before adding.
  const preview = page.getByRole('status').filter({ hasText: name })
  await expect(preview).toContainText('Due Tomorrow 10pm')
  await expect(preview).toContainText('Remind Tomorrow 6pm')
  await expect(preview).toContainText('High')
  await page.getByLabel('Add items').press('Enter')

  await showList(page, 'To-dos')
  const row = page.getByRole('listitem').filter({ hasText: name })
  await expect(row).toHaveCount(1) // ", remind at 6pm" didn't become an item of its own
  await expect(row.getByRole('img', { name: 'High priority' })).toBeVisible()
  await expect(row.getByText('Tomorrow 10pm')).toBeVisible()
  await expect(row.getByRole('img', { name: /Reminder Tomorrow 6pm/ })).toBeVisible()
})

test('remembers the theme choice', async ({ page }) => {
  await pair(page)
  const html = page.locator('html')
  const wasDark = await html.evaluate((el) => el.classList.contains('dark'))
  await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click()
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/)
  await page.reload()
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/)
})

test('syncs between two devices', async ({ browser }) => {
  const phone = await (await browser.newContext()).newPage()
  const mac = await (await browser.newContext()).newPage()
  await pair(phone)
  await pair(mac)

  const name = `sync test ${Date.now()}`
  await add(phone, name)

  // The phone pushes shortly after the change; the other device picks it up on
  // focus, on its 30 s timer, or on reload. Reload until it arrives.
  await expect(async () => {
    await mac.reload()
    await showList(mac, 'To-dos')
    await expect(mac.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })

  // And back: ticking it off on the Mac reaches the phone.
  await mac.getByRole('checkbox', { name: `Check ${name}` }).click()
  await expect(async () => {
    await phone.reload()
    await showList(phone, 'To-dos')
    await expect(phone.getByRole('button', { name, exact: true })).toBeHidden({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
})
