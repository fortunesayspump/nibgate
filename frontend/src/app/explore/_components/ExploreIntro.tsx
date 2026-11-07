export default function ExploreIntro() {
  return (
    <section className="explore-intro" aria-labelledby="explore-intro-title">
      <div className="explore-intro-copy">
        <p className="explore-intro-eyebrow">Explore</p>
        <h1 id="explore-intro-title">Current public articles.</h1>
        <p>
          Browse articles currently listed on eligible hosted creator sites. Discovery checks current public listings against each site’s article manifest.
        </p>
      </div>
      <div className="explore-intro-tags" aria-label="Explore highlights">
        <span>Verified sources</span>
        <span>Agent-readable routes</span>
        <span>Direct creator sites</span>
      </div>
    </section>
  );
}
