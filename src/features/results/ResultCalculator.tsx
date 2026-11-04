import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Check, ImageUp, Plus, ScanLine, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Chip } from '../../components/Chip/Chip';
import { Notice } from '../../components/Notice/Notice';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import { saveMyResults, scanSlip, uploadSlip } from './api';
import { shrinkPhoto } from './image';
import { applyScan, type ElectiveRow } from './scan';
import {
  aggregateOf,
  bestIndexes,
  BEST_ELECTIVES,
  CORE_COUNT,
  CURRICULA,
  ELECTIVE_SUGGESTIONS,
  GRADES,
  type Curriculum,
  type Grade,
  type WassceResults,
} from './types';
import './ResultCalculator.css';

type Mode = 'manual' | 'scan';
type ScanState =
  | { status: 'idle' }
  | { status: 'working'; step: 'preparing' | 'reading'; preview?: string }
  | { status: 'done'; preview: string; filled: number; dropped: string[]; unreadable: number }
  | { status: 'error'; preview?: string; message: string };

const blankRows = (n: number): ElectiveRow[] => Array.from({ length: n }, () => ({ subject: '', grade: '' }));

function rowsFrom(saved: WassceResults | null, curriculum: Curriculum): { cores: Array<Grade | ''>; electives: ElectiveRow[] } {
  const slots = CURRICULA[curriculum].electiveSlots;
  if (!saved) return { cores: Array(CORE_COUNT).fill(''), electives: blankRows(slots) };
  const cores = Array.from({ length: CORE_COUNT }, (_, i) => saved.core_subjects?.[i]?.grade ?? '');
  const electives = (saved.elective_subjects ?? []).map((e) => ({ subject: e.subject, grade: e.grade }));
  return { cores, electives: [...electives, ...blankRows(Math.max(0, slots - electives.length))] };
}

export type ResultCalculatorProps = {
  userId: string;
  /** What's saved now (null = nothing yet). */
  initial: WassceResults | null;
  onSaved?: (results: WassceResults) => void;
};

/**
 * WASSCE Result Calculator: enter grades by hand, or scan a photo of the result
 * slip and review what the AI read. The aggregate updates as you type; the
 * database recomputes it on save, so what admins see always matches the grades.
 */
export function ResultCalculator({ userId, initial, onSaved }: ResultCalculatorProps) {
  const uid = useId();
  const [mode, setMode] = useState<Mode>('manual');
  const [curriculum, setCurriculum] = useState<Curriculum>(initial?.curriculum ?? 'old');
  const [cores, setCores] = useState<Array<Grade | ''>>(() => rowsFrom(initial, initial?.curriculum ?? 'old').cores);
  const [electives, setElectives] = useState<ElectiveRow[]>(() => rowsFrom(initial, initial?.curriculum ?? 'old').electives);
  const [source, setSource] = useState<'manual' | 'scan'>(initial?.source ?? 'manual');
  const [slipPath, setSlipPath] = useState<string | undefined>(initial?.slip_path);
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<WassceResults | null>(initial);
  const [dirty, setDirty] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const spec = CURRICULA[curriculum];
  const electiveGrades = electives.map((e) => (e.subject.trim() ? e.grade : ''));
  const aggregate = aggregateOf(cores, electiveGrades);
  const counted = new Set(bestIndexes(electiveGrades, BEST_ELECTIVES));
  const scanning = scan.status === 'working';

  // Object URLs for the slip preview are released when replaced or on unmount.
  const preview = scan.status === 'idle' ? undefined : scan.preview;
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const touch = () => {
    setDirty(true);
    setSaveError(null);
  };

  const chooseCurriculum = (next: Curriculum) => {
    if (next === curriculum) return;
    const max = CURRICULA[next].maxElectives;
    const filled = electives.filter((e) => e.subject.trim() || e.grade);
    let rows = electives;
    if (filled.length > max) {
      rows = filled.slice(0, max);
      setNotice(`The ${CURRICULA[next].label.toLowerCase()} counts up to ${max} electives, so we kept the first ${max}.`);
    } else {
      rows = [...filled, ...blankRows(Math.max(0, CURRICULA[next].electiveSlots - filled.length))];
      setNotice(null);
    }
    setCurriculum(next);
    setElectives(rows.slice(0, max));
    touch();
  };

  const setCore = (i: number, g: Grade | '') => {
    setCores((cs) => cs.map((c, j) => (j === i ? g : c)));
    touch();
  };
  const setElective = (i: number, patch: Partial<ElectiveRow>) => {
    setElectives((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    touch();
  };
  const addElective = () => {
    setElectives((es) => (es.length < spec.maxElectives ? [...es, { subject: '', grade: '' }] : es));
    touch();
  };
  const removeElective = (i: number) => {
    setElectives((es) => {
      const next = es.filter((_, j) => j !== i);
      return next.length >= spec.electiveSlots ? next : [...next, ...blankRows(spec.electiveSlots - next.length)];
    });
    touch();
  };

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same photo can be picked again after an error
    if (!file) return;
    setNotice(null);
    setScan({ status: 'working', step: 'preparing' });
    let photo: { blob: Blob; dataUrl: string };
    try {
      photo = await shrinkPhoto(file);
    } catch (err) {
      setScan({ status: 'error', message: errorMessage(err) });
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setScan({ status: 'working', step: 'reading', preview: url });
    // The slip is stored for the admissions team; a failed upload never blocks the scan.
    const stored = uploadSlip(userId, photo.blob).catch(() => undefined);
    try {
      const found = await scanSlip(photo.dataUrl);
      const placed = applyScan(curriculum, found);
      setCores(placed.cores);
      setElectives(placed.electives);
      setSource('scan');
      setSlipPath((await stored) ?? slipPath);
      setScan({ status: 'done', preview: url, filled: placed.filled, dropped: placed.dropped, unreadable: placed.unreadable });
      setMode('manual'); // straight to review
      touch();
    } catch (err) {
      await stored;
      setScan({ status: 'error', preview: url, message: errorMessage(err) });
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (cores.some((g) => !g)) return setSaveError('Pick a grade for each of the three core subjects.');
    const unnamed = electives.find((r) => r.grade && !r.subject.trim());
    if (unnamed) return setSaveError('Type the name of every elective you’ve given a grade.');
    const ungraded = electives.find((r) => r.subject.trim() && !r.grade);
    if (ungraded) return setSaveError(`Pick a grade for ${ungraded.subject.trim()}, or remove it.`);
    const filled = electives.filter((r) => r.subject.trim() && r.grade);
    if (filled.length < BEST_ELECTIVES) return setSaveError(`Add at least ${BEST_ELECTIVES} electives with grades.`);

    setSaving(true);
    try {
      const result = await saveMyResults(userId, {
        curriculum,
        core_subjects: spec.cores.map((subject, i) => ({ subject, grade: cores[i] as Grade })),
        elective_subjects: filled.map((r) => ({ subject: r.subject.trim(), grade: r.grade as Grade })),
        source,
        ...(slipPath ? { slip_path: slipPath } : {}),
      });
      setSaved(result);
      setDirty(false);
      onSaved?.(result);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="calc" variants={staggerParent} initial="hidden" animate="show">
      <Card tone="raised" className="calc__summary" aria-live="polite">
        <div className="calc__agg">
          <span className="calc__agg-label">Your aggregate</span>
          <span className="calc__agg-value" data-empty={aggregate === null || undefined}>
            {aggregate ?? '—'}
          </span>
        </div>
        <p className="calc__agg-note">
          {aggregate === null
            ? `Add your three core grades and at least ${BEST_ELECTIVES} electives.`
            : `${spec.label}: 3 cores + your best 3 electives. 6 is the best possible.`}
        </p>
        {saved && !dirty && (
          <p className="calc__saved">
            <Check aria-hidden="true" /> Saved to your profile
          </p>
        )}
      </Card>

      <motion.div className="calc__modes" role="radiogroup" aria-label="How do you want to add your results?" variants={riseItem}>
        <Chip kind="radio" selected={mode === 'manual'} onToggle={() => setMode('manual')}>
          Enter grades
        </Chip>
        <Chip kind="radio" selected={mode === 'scan'} onToggle={() => setMode('scan')} icon={<ScanLine aria-hidden="true" />}>
          Scan result slip
        </Chip>
      </motion.div>

      {mode === 'scan' && (
        <Card className="calc__scan" aria-labelledby={`${uid}-scan`} aria-busy={scanning || undefined}>
          <h2 id={`${uid}-scan`} className="calc__h2">
            Upload Result Slip
          </h2>
          <p className="calc__hint">Lay the slip flat in good light, with every grade in frame. We’ll read it and fill in the grades for you to check.</p>

          {preview && (
            <div className="calc__preview" data-scanning={scanning || undefined}>
              <img src={preview} alt="Your result slip" />
              {scanning && <span className="calc__sweep" aria-hidden="true" />}
            </div>
          )}

          <p className="calc__status" role="status">
            {scan.status === 'working' && (scan.step === 'preparing' ? 'Preparing your photo…' : 'Reading your grades… this usually takes a few seconds.')}
          </p>

          <div className="calc__pick">
            <Button variant="gold" block icon={<Camera aria-hidden="true" />} loading={scanning} onClick={() => cameraRef.current?.click()}>
              Take a photo
            </Button>
            <Button variant="secondary" block icon={<ImageUp aria-hidden="true" />} disabled={scanning} onClick={() => galleryRef.current?.click()}>
              Choose from gallery
            </Button>
          </div>
          {/* capture opens the rear camera on phones; desktops fall back to the file picker. */}
          <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={onPhoto} />
          <input ref={galleryRef} className="visually-hidden" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={onPhoto} />

          {scan.status === 'error' && (
            <Notice tone="error" action={<Button size="sm" variant="secondary" onClick={() => setMode('manual')}>Enter by hand</Button>}>
              {scan.message}
            </Notice>
          )}
        </Card>
      )}

      {mode === 'manual' && (
        <motion.form className="calc__form" onSubmit={save} variants={riseItem} noValidate>
          <AnimatePresence>
            {scan.status === 'done' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Notice tone="success">
                  We read {scan.filled} subject{scan.filled === 1 ? '' : 's'} from your slip.
                  {scan.unreadable > 0 && ` ${scan.unreadable} grade${scan.unreadable === 1 ? ' was' : 's were'} unclear — fill ${scan.unreadable === 1 ? 'it' : 'them'} in.`}
                  {scan.dropped.length > 0 && ` Not counted: ${scan.dropped.join(', ')}.`} Check every grade against your slip, then save.
                </Notice>
              </motion.div>
            )}
          </AnimatePresence>
          {notice && <Notice tone="info">{notice}</Notice>}

          <Card className="calc__group">
            <fieldset>
              <legend className="calc__h2">Curriculum</legend>
              <div className="calc__curricula" role="radiogroup" aria-label="Curriculum">
                {(Object.keys(CURRICULA) as Curriculum[]).map((c) => (
                  <Chip key={c} kind="radio" selected={curriculum === c} onToggle={() => chooseCurriculum(c)}>
                    {CURRICULA[c].label}
                  </Chip>
                ))}
              </div>
              <p className="calc__hint">{spec.detail}</p>
            </fieldset>
          </Card>

          <Card className="calc__group">
            <fieldset>
              <legend className="calc__h2">Core subjects</legend>
              <ul className="calc__rows" role="list">
                {spec.cores.map((name, i) => (
                  <li key={name} className="calc__row" data-counted={cores[i] ? true : undefined} data-missing={(scan.status === 'done' && !cores[i]) || undefined}>
                    <span className="calc__subject calc__subject--fixed">{name}</span>
                    <GradeSelect id={`${uid}-core-${i}`} label={`${name} grade`} value={cores[i]} onChange={(g) => setCore(i, g)} />
                  </li>
                ))}
              </ul>
            </fieldset>
          </Card>

          <Card className="calc__group">
            <fieldset>
              <legend className="calc__h2">Elective subjects</legend>
              <p className="calc__hint">Your best {BEST_ELECTIVES} count — they’re marked with a tick.</p>
              <datalist id={`${uid}-subjects`}>
                {ELECTIVE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <ul className="calc__rows" role="list">
                {electives.map((row, i) => {
                  const isCounted = counted.has(i);
                  return (
                    <li key={i} className="calc__row" data-counted={isCounted || undefined} data-missing={(scan.status === 'done' && row.subject && !row.grade) || undefined}>
                      <label className="visually-hidden" htmlFor={`${uid}-el-${i}`}>
                        Elective {i + 1} subject
                      </label>
                      <input
                        id={`${uid}-el-${i}`}
                        className="field__input calc__subject"
                        list={`${uid}-subjects`}
                        placeholder={`Elective ${i + 1}`}
                        value={row.subject}
                        maxLength={80}
                        autoComplete="off"
                        onChange={(e) => setElective(i, { subject: e.target.value })}
                      />
                      <GradeSelect id={`${uid}-el-${i}-g`} label={`Elective ${i + 1} grade`} value={row.grade} onChange={(g) => setElective(i, { grade: g })} />
                      <span className="calc__mark" aria-hidden="true">
                        {isCounted && <Check />}
                      </span>
                      {electives.length > spec.electiveSlots || row.subject || row.grade ? (
                        <button type="button" className="calc__remove" aria-label={`Remove elective ${i + 1}`} onClick={() => removeElective(i)}>
                          <Trash2 aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="calc__remove" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ul>
              {electives.length < spec.maxElectives && (
                <Button variant="quiet" size="sm" icon={<Plus aria-hidden="true" />} onClick={addElective}>
                  Add elective {electives.length + 1}
                </Button>
              )}
            </fieldset>
          </Card>

          {saveError && <Notice tone="error">{saveError}</Notice>}
          <Button type="submit" size="lg" block loading={saving} disabled={!dirty && Boolean(saved)}>
            {saved ? 'Save changes' : 'Save my results'}
          </Button>
          <p className="calc__fine">Your results are private. Afriversity’s admissions team sees them when you apply through us.</p>
        </motion.form>
      )}
    </motion.div>
  );
}

function GradeSelect({ id, label, value, onChange }: { id: string; label: string; value: Grade | ''; onChange: (g: Grade | '') => void }) {
  return (
    <select id={id} className="field__input field__select calc__grade" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Grade | '')}>
      <option value="">Grade</option>
      {GRADES.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}
