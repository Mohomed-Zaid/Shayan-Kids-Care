import { COMPANY_PHONES, COMPANY_EMAIL, COMPANY_ADDRESS } from './companyContact'

export { COMPANY_PHONES, COMPANY_EMAIL, COMPANY_ADDRESS }

/** HTML lines for print/email templates (invoice preview, GRN, etc.). */
export function companyPhonesHtml() {
  return COMPANY_PHONES.map((num) => `<div>${num}</div>`).join('')
}
