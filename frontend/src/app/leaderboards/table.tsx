// Historical rankings require evidence of visibility when events occurred.
// Keep this legacy component closed even if an older caller passes data.
export default function LeaderboardTable() {
  return <p className="mt-6" role="status">Historical rankings are unavailable because public visibility at the time of the activity cannot be established.</p>;
}
