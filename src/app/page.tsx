'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const UI_STATES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

type UIState = typeof UI_STATES[keyof typeof UI_STATES];
type UploadCardKind = 'person' | 'garment';

type StepDefinition = {
  step: 1 | 2 | 3;
  title: string;
  description: string;
};

const STEPS: StepDefinition[] = [
  { step: 1, title: '上传人物图片', description: '清晰正面照，避免遮挡' },
  { step: 2, title: '上传服饰图片', description: '平铺或正面展示更佳' },
  { step: 3, title: '生成结果', description: '调用真实 AI 换衣流程' }
];

const Icon = ({ name, className }: { name: string; className?: string }) => (
  <span aria-hidden="true" className={cn('material-symbols-outlined leading-none', className)}>
    {name}
  </span>
);

const StatusPill = ({
  tone,
  label
}: {
  tone: 'neutral' | 'blue' | 'amber' | 'green' | 'red';
  label: string;
}) => {
  const classes = cn(
    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
    tone === 'neutral' && 'border-slate-200 bg-white text-slate-600',
    tone === 'blue' && 'border-blue-100 bg-blue-50 text-blue-700',
    tone === 'amber' && 'border-amber-100 bg-amber-50 text-amber-700',
    tone === 'green' && 'border-emerald-100 bg-emerald-50 text-emerald-700',
    tone === 'red' && 'border-red-100 bg-red-50 text-red-700'
  );

  return <span className={classes}>{label}</span>;
};

const SurfaceCard = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      'rounded-[30px] border border-white/80 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.05)]',
      className
    )}
  >
    {children}
  </div>
);

const ActionButton = ({
  children,
  onClick,
  disabled,
  ariaLabel,
  variant = 'secondary',
  className
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-blue-300/60',
      variant === 'primary' &&
        (disabled
          ? 'cursor-not-allowed bg-slate-300 text-white'
          : 'bg-blue-600 text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)] hover:bg-blue-700'),
      variant === 'secondary' &&
        (disabled
          ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
          : 'border border-slate-200 bg-[#f2f2f7] text-slate-700 hover:bg-slate-200/70'),
      className
    )}
  >
    {children}
  </button>
);

const CommerceCtaButton = ({
  children,
  disabled,
  onClick,
  ariaLabel
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'inline-flex items-center justify-center gap-3 rounded-full px-10 py-5 text-base font-semibold transition-all outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300/70 disabled:pointer-events-none disabled:opacity-50',
      disabled
        ? 'bg-slate-300 text-white shadow-none'
        : 'bg-blue-600 text-white shadow-[0_18px_30px_rgba(37,99,235,0.28)] hover:bg-blue-700'
    )}
  >
    {children}
  </button>
);

const Stepper = ({ currentStep, status }: { currentStep: number; status: UIState }) => (
  <div className="rounded-full border border-white/80 bg-white/70 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)] backdrop-blur sm:px-8">
    <div className="flex items-center justify-center gap-3 sm:gap-10">
    {STEPS.map((step, index) => {
      const isDone = step.step < currentStep || (status === UI_STATES.SUCCESS && step.step === 3);
      const isCurrent = step.step === currentStep && status !== UI_STATES.SUCCESS;

      return (
        <div key={step.step} className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
                isDone && 'bg-blue-600 text-white',
                isCurrent && 'bg-blue-600 text-white',
                !isDone && !isCurrent && 'bg-slate-300 text-white'
              )}
            >
              {step.step}
            </div>
            <div
              className={cn(
                'hidden text-sm font-semibold sm:block',
                isDone || isCurrent ? 'text-slate-900' : 'text-slate-500'
              )}
            >
              {step.title}
            </div>
          </div>
          {index < STEPS.length - 1 ? <div className="hidden h-px w-12 bg-slate-300 sm:block" aria-hidden="true" /> : null}
        </div>
      );
    })}
    </div>
  </div>
);

const UploadCard = ({
  kind,
  title,
  description,
  image,
  disabled,
  locked,
  buttonLabel,
  helperTitle,
  helperItems,
  onPick,
  onClear,
  onDropFile
}: {
  kind: UploadCardKind;
  title: string;
  description: string;
  image: string | null;
  disabled?: boolean;
  locked?: boolean;
  buttonLabel: string;
  helperTitle: string;
  helperItems: string[];
  onPick: () => void;
  onClear: () => void;
  onDropFile: (file: File) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (files: FileList | null) => {
    if (disabled || locked) return;
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    onDropFile(file);
  };

  return (
    <SurfaceCard className="p-6 sm:p-8">
      <div
        className={cn(
          'relative overflow-hidden rounded-[20px] border-2 border-dashed px-6 py-8 transition-colors',
          'border-slate-200 bg-[#f2f2f7]',
          isDragging && !disabled && !locked && 'border-blue-300 bg-blue-50',
          locked && 'opacity-60'
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled || locked) return;
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (disabled || locked) return;
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleDrop(event.dataTransfer.files);
        }}
      >
        {image ? (
          <img src={image} alt={title} className="aspect-[3/4] w-full rounded-2xl object-cover shadow-[0_12px_24px_rgba(15,23,42,0.08)]" />
        ) : (
          <div className="flex aspect-[3/4] flex-col items-center justify-center text-center">
            <Icon
              name={kind === 'person' ? 'person_add' : 'checkroom'}
              className="mb-4 text-5xl text-slate-400"
            />
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-2 max-w-[15rem] text-xs leading-5 text-slate-500">
              {locked ? '请先完成人物上传，再进行服饰上传' : description}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <ActionButton ariaLabel={buttonLabel} onClick={onPick} disabled={disabled || locked}>
          <Icon name={kind === 'person' ? 'upload' : 'add_photo_alternate'} className="text-base" />
          <span>{buttonLabel}</span>
        </ActionButton>

        <ActionButton
          ariaLabel={`清除${title}`}
          onClick={onClear}
          disabled={disabled || !image}
          className="bg-white"
          variant="secondary"
        >
          <Icon name="delete" className="text-base" />
          <span>清除素材</span>
        </ActionButton>

        <div className="rounded-xl bg-[#f2f2f7] p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {helperTitle}
          </div>
          <ul className="space-y-2">
            {helperItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                <Icon name="check_circle" className="mt-0.5 text-sm text-blue-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-xs">
          <span className="text-slate-500">{locked ? '等待上一步完成' : image ? '素材已就绪' : '等待上传'}</span>
          <StatusPill tone={locked ? 'neutral' : image ? 'green' : 'neutral'} label={image ? '已上传' : '未上传'} />
        </div>
      </div>
    </SurfaceCard>
  );
};

export default function Home() {
  const [status, setStatus] = useState<UIState>(UI_STATES.IDLE);
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [garmentImage, setGarmentImage] = useState<string | null>(null);
  const [personImageUrl, setPersonImageUrl] = useState<string | null>(null);
  const [garmentImageUrl, setGarmentImageUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);

  const personInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

  const isBusy = isUploadingAssets || status === UI_STATES.UPLOADING || status === UI_STATES.PROCESSING;
  const isReady = Boolean(personImage && garmentImage);
  const currentStep = !personImage ? 1 : !garmentImage ? 2 : 3;
  const isGarmentLocked = !personImage;

  const taskStatus = useMemo(() => {
    if (status === UI_STATES.UPLOADING) return { tone: 'amber' as const, label: '上传中' };
    if (status === UI_STATES.PROCESSING) return { tone: 'blue' as const, label: '生成中' };
    if (status === UI_STATES.SUCCESS) return { tone: 'green' as const, label: '已完成' };
    if (status === UI_STATES.ERROR) return { tone: 'red' as const, label: '失败' };
    return { tone: 'neutral' as const, label: '待上传' };
  }, [status]);

  const handleOpenPersonPicker = () => personInputRef.current?.click();
  const handleOpenGarmentPicker = () => garmentInputRef.current?.click();

  const handleResetTaskState = () => {
    setResultImage(null);
    setErrorMsg(null);
    setStatus(UI_STATES.IDLE);
    setPollingTaskId(null);
  };

  const handleJumpToStep = (step: 1 | 2 | 3) => {
    const target = step === 1 ? step1Ref.current : step === 2 ? step2Ref.current : step3Ref.current;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSetPerson = (next: string | null) => {
    handleResetTaskState();
    setPersonImage(next);
    setPersonImageUrl(null);
    if (!next) setGarmentImage(null);
    if (!next) setGarmentImageUrl(null);
  };

  const handleSetGarment = (next: string | null) => {
    handleResetTaskState();
    setGarmentImage(next);
    setGarmentImageUrl(null);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result;
        if (typeof dataUrl !== 'string') {
          reject(new Error('读取图片失败'));
          return;
        }
        resolve(dataUrl);
      };
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });

  const uploadImageFile = async (file: File, kind: UploadCardKind) => {
    const maxBytes = 1 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error('图片过大：请上传不超过 1MB 的图片');
    }

    const formData = new FormData();
    formData.set('kind', kind);
    formData.set('file', file);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const raw = await res.text();
    const payload = (() => {
      try {
        return JSON.parse(raw) as { url?: string; error?: string };
      } catch {
        return null;
      }
    })();

    if (!res.ok) {
      throw new Error(payload?.error || raw || '上传失败');
    }

    if (!payload?.url) {
      throw new Error('上传失败：缺少图片 URL');
    }

    return payload.url;
  };

  const handleLoadAndUpload = async (file: File, kind: UploadCardKind) => {
    setErrorMsg(null);
    setIsUploadingAssets(true);

    try {
      const previewDataUrl = await readFileAsDataUrl(file);
      if (kind === 'person') {
        handleSetPerson(previewDataUrl);
      } else {
        handleSetGarment(previewDataUrl);
      }

      const uploadedUrl = await uploadImageFile(file, kind);

      if (kind === 'person') {
        setPersonImageUrl(uploadedUrl);
      } else {
        setGarmentImageUrl(uploadedUrl);
      }
    } finally {
      setIsUploadingAssets(false);
    }
  };

  const handleImageUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: UploadCardKind
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await handleLoadAndUpload(file, kind);
    } catch (error: any) {
      setErrorMsg(error.message || '读取图片失败');
    }
  };

  const handleDroppedFile = async (file: File, kind: UploadCardKind) => {
    try {
      await handleLoadAndUpload(file, kind);
    } catch (error: any) {
      setErrorMsg(error.message || '读取图片失败');
    }
  };

  const handleGenerate = async () => {
    if (isBusy) return;
    if (!isReady) {
      setErrorMsg('请上传人物图片和服装图片');
      return;
    }
    if (!personImageUrl || !garmentImageUrl) {
      setErrorMsg('图片正在上传，请稍后再生成');
      return;
    }

    setStatus(UI_STATES.UPLOADING);
    setErrorMsg(null);
    setResultImage(null);

    try {
      const res = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personUrl: personImageUrl,
          garmentUrl: garmentImageUrl,
          mode: 'realistic'
        })
      });

      if (!res.ok) {
        const raw = await res.text();
        const errorData = (() => {
          try {
            return JSON.parse(raw) as { error?: string };
          } catch {
            return null;
          }
        })();
        throw new Error(errorData?.error || raw || '创建任务失败');
      }

      const { taskId } = await res.json();
      setStatus(UI_STATES.PROCESSING);
      setPollingTaskId(taskId);
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || '系统错误');
      setStatus(UI_STATES.ERROR);
    }
  };

  useEffect(() => {
    if (!pollingTaskId || status !== UI_STATES.PROCESSING) return;

    let timeoutId: NodeJS.Timeout;
    let isPolling = true;

    const poll = async () => {
      if (!isPolling) return;

      try {
        const res = await fetch(`/api/status?taskId=${pollingTaskId}`);
        if (!res.ok) throw new Error('查询状态失败');

        const data = await res.json();

        if (data.status === 'success') {
          setResultImage(data.resultUrl);
          setStatus(UI_STATES.SUCCESS);
          setPollingTaskId(null);
          isPolling = false;
          return;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || '生成失败');
        }

        timeoutId = setTimeout(poll, 2000);
      } catch (error: any) {
        console.error(error);
        setErrorMsg(error.message || '查询状态失败');
        setStatus(UI_STATES.ERROR);
        setPollingTaskId(null);
        isPolling = false;
      }
    };

    void poll();

    return () => {
      isPolling = false;
      clearTimeout(timeoutId);
    };
  }, [pollingTaskId, status]);

  const handleReset = () => {
    handleSetPerson(null);
    setGarmentImage(null);
    setPersonImageUrl(null);
    setGarmentImageUrl(null);
    setResultImage(null);
    setStatus(UI_STATES.IDLE);
    setErrorMsg(null);
    setPollingTaskId(null);
    setIsUploadingAssets(false);

    if (personInputRef.current) personInputRef.current.value = '';
    if (garmentInputRef.current) garmentInputRef.current.value = '';
  };

  const handleDownloadResult = async () => {
    if (!resultImage) return;

    try {
      const res = await fetch(resultImage);
      if (!res.ok) throw new Error('下载失败');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'virtual-try-on-result.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(resultImage, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-slate-900">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/70 bg-white/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold tracking-tight text-slate-900">LuxeTry</div>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                Studio
              </span>
            </div>
            <div className="hidden items-center gap-6 md:flex">
              <button
                type="button"
                onClick={() => handleJumpToStep(1)}
                className="text-sm text-slate-500 transition-colors hover:text-slate-900"
              >
                Upload Person
              </button>
              <button
                type="button"
                onClick={() => handleJumpToStep(2)}
                className="text-sm text-slate-500 transition-colors hover:text-slate-900"
              >
                Upload Clothing
              </button>
              <button
                type="button"
                onClick={() => handleJumpToStep(3)}
                className="border-b-2 border-blue-600 pb-1 text-sm font-semibold text-blue-600"
              >
                Generate
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="帮助"
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="help" className="text-xl" />
            </button>
            <button
              type="button"
              aria-label="设置"
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="settings" className="text-xl" />
            </button>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              AI
            </div>
          </div>
        </div>
      </nav>

      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={personInputRef}
        onChange={(event) => {
          void handleImageUpload(event, 'person');
        }}
      />
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={garmentInputRef}
        onChange={(event) => {
          void handleImageUpload(event, 'garment');
        }}
      />

      <div className="px-4 pb-12 pt-24 sm:px-6 lg:px-10 lg:pr-[24.5rem]">
        <div className="mx-auto max-w-[1000px]">
          <header className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <Icon name="auto_awesome" className="text-sm text-blue-600" />
              <span>Apple 风工具台视觉</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              虚拟换衣体验
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              上传您的人物照片和服饰图，即刻预览真实试穿效果
            </p>
            <div className="mt-4 flex justify-center">
              <StatusPill tone={taskStatus.tone} label={`任务状态：${taskStatus.label}`} />
            </div>
          </header>

          <div className="mb-12 flex justify-center">
            <Stepper currentStep={currentStep} status={status} />
          </div>

          {errorMsg ? (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="font-semibold">操作失败</div>
              <div className="mt-1">{errorMsg}</div>
            </div>
          ) : null}

          <section className="grid gap-8 xl:grid-cols-2">
            <div ref={step1Ref}>
              <UploadCard
                kind="person"
                title="第一步：上传人物"
                description="点击或拖拽 JPG/PNG 格式照片"
                image={personImage}
                disabled={isBusy}
                buttonLabel={personImage ? '更换人物照片' : '选择照片'}
                helperTitle="上传建议"
                helperItems={['正面全身或半身照，光线充足', '避免过于宽松或遮挡身体的衣物']}
                onPick={handleOpenPersonPicker}
                onClear={() => handleSetPerson(null)}
                onDropFile={(file) => {
                  void handleDroppedFile(file, 'person');
                }}
              />
            </div>

            <div ref={step2Ref}>
              <UploadCard
                kind="garment"
                title="第二步：上传服饰"
                description="选择您想要试穿的单品图片"
                image={garmentImage}
                disabled={isBusy}
                locked={isGarmentLocked}
                buttonLabel={garmentImage ? '更换服饰图片' : '选择服饰'}
                helperTitle="图片要求"
                helperItems={['建议使用纯色背景的平铺图', '确保服饰细节清晰完整']}
                onPick={handleOpenGarmentPicker}
                onClear={() => handleSetGarment(null)}
                onDropFile={(file) => {
                  void handleDroppedFile(file, 'garment');
                }}
              />
            </div>
          </section>

          <div ref={step3Ref} className="mt-12 flex flex-col items-center justify-center gap-4">
            <CommerceCtaButton
              ariaLabel="开始生成试穿图"
              onClick={handleGenerate}
              disabled={isBusy || !isReady}
            >
              <span>
                {isUploadingAssets
                  ? '上传素材中…'
                  : status === UI_STATES.UPLOADING
                  ? '上传中…'
                  : status === UI_STATES.PROCESSING
                    ? 'AI 正在生成中…'
                    : '开始生成试穿图'}
              </span>
              <Icon name="auto_awesome" className="text-xl" />
            </CommerceCtaButton>

            <div className="max-w-sm text-center text-xs leading-5 text-slate-500">
              当前状态：{taskStatus.label}。素材准备完成后即可发起生成，过程中请保持页面开启。
            </div>
          </div>
        </div>

        <aside className="mt-8 flex flex-col gap-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_45px_rgba(15,23,42,0.08)] lg:fixed lg:right-0 lg:top-16 lg:mt-0 lg:h-[calc(100vh-4rem)] lg:w-[23rem] lg:rounded-none lg:border-b-0 lg:border-l lg:border-r-0 lg:border-t-0 lg:bg-white/92 lg:px-6 lg:py-5 lg:shadow-[-20px_0_40px_rgba(15,23,42,0.08)] lg:backdrop-blur-xl">
          <header className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold text-slate-900">生成结果预览</div>
              <StatusPill tone={taskStatus.tone} label={taskStatus.label} />
            </div>
            <div className="text-xs font-medium text-slate-500">管理生成资源与输出</div>
          </header>

          <div className="relative overflow-hidden rounded-[22px] border border-slate-100 bg-[#f2f2f7] lg:flex-1">
            {resultImage ? (
              <img src={resultImage} alt="换衣结果" className="h-full min-h-[18rem] w-full object-cover lg:min-h-0" />
            ) : (
              <div className="flex h-[18rem] flex-col items-center justify-center px-6 text-center lg:h-full">
                <Icon name="image_search" className="mb-4 text-5xl text-slate-300" />
                <div className="text-sm font-medium text-slate-400">生成的图片将在这里显示</div>
              </div>
            )}

            {isBusy ? (
              <div className="absolute inset-x-4 bottom-4 rounded-xl border border-slate-100 bg-white/90 p-3 backdrop-blur">
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-blue-600">
                  <span>AI 正在渲染细节...</span>
                  <span>{status === UI_STATES.UPLOADING ? '35%' : '75%'}</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      'h-full bg-blue-600 transition-all',
                      status === UI_STATES.UPLOADING ? 'w-[35%]' : 'w-[75%]'
                    )}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <section className="space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">当前素材</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                {personImage ? (
                  <img src={personImage} alt="人物素材缩略图" className="aspect-square h-full w-full object-cover" />
                ) : (
                  <div className="flex aspect-square h-full items-center justify-center text-xs text-slate-400">人物</div>
                )}
                <div className="border-t border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500">人物素材</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                {garmentImage ? (
                  <img src={garmentImage} alt="服饰素材缩略图" className="aspect-square h-full w-full object-cover" />
                ) : (
                  <div className="flex aspect-square h-full items-center justify-center text-xs text-slate-400">服饰</div>
                )}
                <div className="border-t border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500">服饰素材</div>
              </div>
            </div>
          </section>

          <div className="mt-auto space-y-3 border-t border-slate-100 pt-6">
            <ActionButton
              ariaLabel="下载高清结果"
              onClick={handleDownloadResult}
              disabled={!resultImage}
              variant="primary"
              className="py-4"
            >
              <Icon name="download" className="text-lg" />
              <span>下载高清结果</span>
            </ActionButton>
            <ActionButton ariaLabel="重新生成" onClick={handleReset} disabled={isBusy}>
              <Icon name="refresh" className="text-lg" />
              <span>重新生成</span>
            </ActionButton>
          </div>

          <div className="flex items-center justify-between px-2 pt-2">
            <div className="flex flex-col items-center gap-1 text-blue-600">
              <Icon name="history" className="text-xl" />
              <span className="text-[10px] font-bold">历史</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-slate-400">
              <Icon name="tune" className="text-xl" />
              <span className="text-[10px] font-bold">预设</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-slate-400">
              <Icon name="texture" className="text-xl" />
              <span className="text-[10px] font-bold">材质</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-slate-400">
              <Icon name="download" className="text-xl" />
              <span className="text-[10px] font-bold">导出</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
