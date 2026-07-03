import { ProfileActionButtons } from '@/components/ProfileActionButtons';
import { ProfilePhoto } from '@/components/ui/ProfilePhoto';
import { memo } from 'react';
import { useUserQuery } from '@/hooks/queries/useUserQuery';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/cn';
import Link from 'next/link';

export const DiscoverProfile = memo(
  ({ userId }: { userId: string }) => {
    /**
     * Since the query function of <DiscoverProfiles> already created a query
     * cache for the user data, we can just access it here using the `useUserQuery()`
     */
    const { data: user, isPending, isError } = useUserQuery(userId);
    const { data: session } = useSession();

    if (isPending) return <div>Loading...</div>;
    if (isError) return <div>Error loading profile.</div>;
    if (!user) return null;

    return (
      <div className="overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <div className="flex flex-col items-center gap-4 border-b border-border bg-slate-50 py-6">
          <div className="h-24 w-24">
            <ProfilePhoto
              name={user.name}
              username={user.username}
              photoUrl={user.profilePhoto}
              fallbackAvatarClassName="text-5xl"
            />
          </div>
          {/* Only show the action buttons when the profile is not the user's. */}
          {session?.user.id !== user.id && <ProfileActionButtons targetUserId={user.id} />}
        </div>
        <div className="flex flex-col items-center px-5 py-6">
          <h2 className="mb-2 cursor-pointer px-2 text-center font-display text-xl font-semibold text-slate-950">
            <Link href={`/${user.username}`} className="link">
              {user.name}
            </Link>
          </h2>
          <p className="mb-4 px-2 text-center text-sm leading-6 text-slate-500">{user.bio || 'No bio yet'}</p>
          <div className="flex gap-6">
            <p className="flex justify-center gap-1 text-sm font-semibold text-slate-950">
              <span>{user.followerCount}</span> <span className="text-slate-500">Followers</span>
            </p>
            <p className="flex justify-center gap-1 text-sm font-semibold text-slate-950">
              <span>{user.followingCount}</span> <span className="text-slate-500">Following</span>
            </p>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.userId === nextProps.userId,
);

DiscoverProfile.displayName = 'DiscoverProfile';
