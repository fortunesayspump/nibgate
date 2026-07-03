'use client';

import { ProfileActionButtons } from '@/components/ProfileActionButtons';
import { GetUser } from '@/types/definitions';
import { useUserQuery } from '@/hooks/queries/useUserQuery';
import Link from 'next/link';
import { Ellipse } from '@/svg_components';
import { ButtonLink } from '@/components/ui/ButtonLink';
import Tabs from './Tabs';
import CoverPhoto from './CoverPhoto';
import ProfilePhoto from './ProfilePhoto';

export function ProfileHeader({
  isOwnProfile,
  initialProfileData,
}: {
  isOwnProfile: boolean;
  initialProfileData: GetUser;
}) {
  const { data } = useUserQuery(initialProfileData.id);
  // If there is no query of the user data yet, use the
  // `initialProfileData` that was fetched on server.
  const profile = data || initialProfileData;

  return (
    <>
      <div className="relative mb-[88px] md:pt-6">
        <div className="h-60 overflow-hidden rounded-md border border-border bg-slate-100 shadow-sm">
          <CoverPhoto isOwnProfile={isOwnProfile} photoUrl={profile.coverPhoto} />
        </div>
        <ProfilePhoto isOwnProfile={isOwnProfile} photoUrl={profile.profilePhoto} name={initialProfileData.name!} />
        <div className="absolute -bottom-20 right-2 md:right-0">
          {isOwnProfile ? (
            <ButtonLink shape="pill" mode="subtle" href="/edit-profile">
              Edit Profile
            </ButtonLink>
          ) : (
            <ProfileActionButtons targetUserId={profile.id} />
          )}
        </div>
      </div>

      <div className="px-1 pt-2">
        <h1 className="font-display text-2xl font-bold text-slate-950">{profile.name}</h1>
        <p className="-mt-1 mb-2 text-sm text-slate-500">@{profile.username}</p>
        <p className="text-sm leading-6 text-slate-700">{profile.bio}</p>
        <div className="flex flex-row items-center gap-3">
          <Link
            href={`/${profile.username}/followers`}
            className="link"
            title={`${initialProfileData.name}&apos; followers`}>
            <span className="font-semibold text-slate-950">{profile.followerCount}</span>{' '}
            <span className="font-medium text-slate-500">Followers</span>
          </Link>
          <Ellipse className="h-1 w-1 fill-slate-400" />
          <Link
            href={`/${profile.username}/following`}
            className="link"
            title={`${initialProfileData.name}&apos; followed users`}>
            <span className="font-semibold text-slate-950">{profile.followingCount}</span>{' '}
            <span className="font-medium text-slate-500">Following</span>
          </Link>
        </div>
        <Tabs isOwnProfile={isOwnProfile} />
      </div>
    </>
  );
}
