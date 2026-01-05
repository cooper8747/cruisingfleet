import { ZohoReportView } from "../page"

export default async function AccountFilteredPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params
  return <ZohoReportView accountIdFilter={accountId} />
}
