'use client';

import { useState, useRef, useEffect } from 'react';

const UI_STATES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

type UIState = typeof UI_STATES[keyof typeof UI_STATES];

export default function Home() {
  const [status, setStatus] = useState<UIState>(UI_STATES.IDLE);
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [garmentImage, setGarmentImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  
  const personInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>, 
    setImg: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImg(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (status === UI_STATES.UPLOADING || status === UI_STATES.PROCESSING) return;
    if (!personImage || !garmentImage) {
      setErrorMsg('请上传人物图片和服装图片');
      return;
    }

    setStatus(UI_STATES.UPLOADING);
    setErrorMsg(null);
    setResultImage(null);

    try {
      // 1. Create task
      const res = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personBase64: personImage,
          garmentBase64: garmentImage,
          mode: 'realistic'
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '创建任务失败');
      }

      const { taskId } = await res.json();
      
      // 2. Start polling
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
        } else if (data.status === 'failed') {
          throw new Error(data.error || '生成失败');
        } else {
          // processing or pending, continue polling
          timeoutId = setTimeout(poll, 2000);
        }
      } catch (error: any) {
        console.error(error);
        setErrorMsg(error.message || '查询状态失败');
        setStatus(UI_STATES.ERROR);
        setPollingTaskId(null);
        isPolling = false;
      }
    };

    poll();

    return () => {
      isPolling = false;
      clearTimeout(timeoutId);
    };
  }, [pollingTaskId, status]);

  const handleReset = () => {
    setPersonImage(null);
    setGarmentImage(null);
    setResultImage(null);
    setStatus(UI_STATES.IDLE);
    setErrorMsg(null);
    if (personInputRef.current) personInputRef.current.value = '';
    if (garmentInputRef.current) garmentInputRef.current.value = '';
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">虚拟换衣系统 V2</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Person Upload */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[300px]">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">1. 上传人物图</h2>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={personInputRef}
              onChange={(e) => handleImageUpload(e, setPersonImage)}
            />
            {personImage ? (
              <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden cursor-pointer" onClick={() => personInputRef.current?.click()}>
                <img src={personImage} alt="Person" className="object-cover w-full h-full" />
                <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <span className="text-white font-medium">点击更换</span>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => personInputRef.current?.click()}
                className="w-full aspect-[3/4] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors"
              >
                + 选择人物图片
              </button>
            )}
          </div>

          {/* Garment Upload */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[300px]">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">2. 上传服装图</h2>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={garmentInputRef}
              onChange={(e) => handleImageUpload(e, setGarmentImage)}
            />
            {garmentImage ? (
              <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden cursor-pointer" onClick={() => garmentInputRef.current?.click()}>
                <img src={garmentImage} alt="Garment" className="object-cover w-full h-full" />
                <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <span className="text-white font-medium">点击更换</span>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => garmentInputRef.current?.click()}
                className="w-full aspect-[3/4] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors"
              >
                + 选择服装图片
              </button>
            )}
          </div>
        </div>

        {/* Controls & Status */}
        <div className="flex flex-col items-center mb-12">
          {errorMsg && (
            <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 w-full max-w-md text-center">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={status === UI_STATES.UPLOADING || status === UI_STATES.PROCESSING || !personImage || !garmentImage}
            className={`px-8 py-4 rounded-full text-lg font-bold text-white shadow-lg transition-all transform hover:scale-105 ${
              status === UI_STATES.UPLOADING || status === UI_STATES.PROCESSING || !personImage || !garmentImage
                ? 'bg-gray-400 cursor-not-allowed transform-none hover:scale-100'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {status === UI_STATES.IDLE || status === UI_STATES.ERROR ? '立即生成换衣效果' : null}
            {status === UI_STATES.UPLOADING ? '正在上传图片...' : null}
            {status === UI_STATES.PROCESSING ? 'AI 生成中，请稍候...' : null}
            {status === UI_STATES.SUCCESS ? '生成成功！(再次生成)' : null}
          </button>
          
          {(status === UI_STATES.PROCESSING || status === UI_STATES.UPLOADING) && (
            <p className="mt-4 text-gray-500 animate-pulse">预计需要 15-30 秒，请耐心等待...</p>
          )}
        </div>

        {/* Result Area */}
        {resultImage && status === UI_STATES.SUCCESS && (
          <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 flex flex-col items-center mt-8 animate-fade-in-up">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">生成结果</h2>
            <div className="w-full max-w-md rounded-lg overflow-hidden shadow-md">
              <img src={resultImage} alt="Result" className="w-full h-auto" />
            </div>
            <button 
              onClick={handleReset}
              className="mt-8 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              重新开始
            </button>
          </div>
        )}
      </div>
    </main>
  );
}