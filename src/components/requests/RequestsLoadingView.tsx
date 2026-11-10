import styles from "@/app/initiatives/[initiativeId]/requests/loading.module.css";

const rows = [0, 1, 2, 3, 4];

/** Shown by Next.js while the real Requests page is rendering. The status
 * describes the work underway; it does not invent completed steps or a
 * percentage that the server cannot report. */
export default function RequestsLoadingView() {
  return (
    <div className={styles.scene}>
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.summary}>
          {[0, 1, 2].map(index => (
            <div className={styles.summaryCard} key={index}>
              <span className={styles.summaryIcon} />
              <div className={styles.summaryLines}><span /><span /></div>
              <span className={styles.summaryFooter} />
            </div>
          ))}
        </div>
        <div className={styles.workarea}>
          <div className={styles.list}>
            <div className={styles.listToolbar}><span /><span /></div>
            {rows.map(row => <div className={styles.listRow} key={row}><span className={styles.checkbox} /><div><span /><span /></div></div>)}
          </div>
          <div className={styles.details}>
            <div className={styles.detailLine} />
            <div className={styles.detailLineShort} />
            <div className={styles.detailBoxes}><span /><span /></div>
            <div className={styles.detailLine} />
            <div className={styles.detailLineShort} />
          </div>
        </div>
      </div>

      <section className={styles.card} role="status" aria-live="polite" aria-label="Loading Requests and Priorities">
        <div className={styles.cardBody}>
          <div className={styles.progressRing} aria-hidden="true"><span>Loading</span></div>
          <div className={styles.cardText}>
            <h1>Getting your workspace ready</h1>
            <p>Loading Requests &amp; Priorities</p>
            <div className={styles.steps}>
              <div><span className={styles.stepIcon} aria-hidden="true">•••</span><span>Checking your account</span></div>
              <div><span className={styles.stepIcon} aria-hidden="true">•••</span><span>Confirming access to this initiative</span></div>
              <div><span className={styles.stepIcon} aria-hidden="true">•••</span><span>Loading saved requests</span></div>
            </div>
          </div>
        </div>
        <div className={styles.progressTrack} aria-hidden="true"><span /></div>
        <p className={styles.footer}>Your requests will appear as soon as they are ready.</p>
      </section>
    </div>
  );
}
