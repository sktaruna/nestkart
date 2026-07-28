export default function Newsletter() {
  return (
    <section className="newsletter">
      <div className="newsletter__inner">
        <p className="newsletter__kicker">Stay Connected</p>
        <h2 className="newsletter__title">Beautiful spaces,<br />in your inbox.</h2>
        <p className="newsletter__sub">New arrivals, styling ideas, and exclusive offers — delivered thoughtfully.</p>
        <form className="newsletter__form" onSubmit={(e) => e.preventDefault()}>
          <input type="email" className="newsletter__input" placeholder="Your email address" />
          <button className="newsletter__btn" type="submit">Subscribe</button>
        </form>
      </div>
    </section>
  );
}
