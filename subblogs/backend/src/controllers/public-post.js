function publicPost(post) {
  if (!post) return post;
  const safe = { ...post };
  for (const field of ['contentKey', 'bodyStorageRef', 'audioEncryptedKey', 'videoEncryptedKey', 'documentEncryptedKey', 'whitelist']) delete safe[field];
  const locked = (safe.price && safe.price !== '0') || safe.publicAccess === false;
  if (locked) {
    for (const field of ['bodyMarkdown', 'body', 'media', 'audioUrl', 'videoUrl', 'documentUrl', 'audioStorageRef', 'videoStorageRef', 'documentStorageRef']) delete safe[field];
  } else if (safe.media) {
    try {
      const items = JSON.parse(safe.media);
      safe.media = JSON.stringify(items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const { encryptedKey, ...publicItem } = item;
        return publicItem;
      }));
    } catch { safe.media = null; }
  }
  return safe;
}

module.exports = { publicPost };
