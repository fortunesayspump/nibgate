'use client';

import { useCreatePostModal } from '@/hooks/useCreatePostModal';
import SvgImage from '@/svg_components/Image';
import { useCallback } from 'react';
import { ProfilePhotoOwn } from './ui/ProfilePhotoOwn';
import { ButtonNaked } from './ui/ButtonNaked';

export function CreatePostModalLauncher() {
  const { launchCreatePost } = useCreatePostModal();
  const launcCreatePostFinderClosed = useCallback(() => launchCreatePost({}), [launchCreatePost]);
  const launchCreatePostFinderOpened = useCallback(() => {
    launchCreatePost({
      shouldOpenFileInputOnMount: true,
    });
  }, [launchCreatePost]);

  return (
    <div className="rounded-md border border-border bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="mb-4 flex flex-row">
        <div className="mr-3 h-10 w-10">
          <ProfilePhotoOwn />
        </div>
        <ButtonNaked
          onPress={launcCreatePostFinderClosed}
          className="flex flex-grow flex-col justify-center rounded-md border border-border bg-slate-50 px-4 text-left hover:border-emerald-200 hover:bg-emerald-50">
          <p className="text-sm font-medium text-slate-500">Publish an article, update, video, image, or drop.</p>
        </ButtonNaked>
      </div>
      <div className="flex flex-row gap-4">
        <ButtonNaked
          onPress={launchCreatePostFinderOpened}
          className="group flex cursor-pointer flex-row items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100">
          <SvgImage className="h-5 w-5 text-slate-500" />
          <p className="text-sm font-semibold text-slate-500 group-hover:text-slate-950">
            Image / Video
          </p>
        </ButtonNaked>
        {/* <ButtonNaked className="group flex cursor-pointer flex-row items-center gap-4">
          <EmojiHappySmile stroke="black" width={24} height={24} />
          <p className="text-base font-semibold text-gray-500 group-hover:text-black">
            Mood
          </p>
        </ButtonNaked> */}
      </div>
    </div>
  );
}
