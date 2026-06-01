/**
 * /app/team is retired — the workload dashboard now lives at /app/workload to
 * avoid confusion with the People (settings/team) + Teams (settings/teams) pages.
 */
import { redirect } from 'next/navigation';

export default function TeamRedirect() {
  redirect('/app/workload');
}
