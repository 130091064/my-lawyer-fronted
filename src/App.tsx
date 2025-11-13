import { type ChangeEvent, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_MASTRA_API_BASE_URL;

type Nullable<T> = T | null;

type StructuredSummons = {
  caseNumber: Nullable<string>;
  cause: Nullable<string>;
  hearingTime: Nullable<string>;
  court: Nullable<string>;
  courtAddress: Nullable<string>;
  summonedPerson: Nullable<string>;
  rawText: string;
};

type TransitSuggestion =
  | string
  | {
      line?: Nullable<string>;
      suggestion: string;
    };

type GenericSuggestion =
  | string
  | {
      suggestion: string;
    };

type TransportAdvice = {
  bestArrivalWindow: Nullable<string>;
  publicTransit: Array<TransitSuggestion>;
  driving: Array<GenericSuggestion>;
  taxiOrRideHailing: Array<GenericSuggestion>;
  notes: string[];
};

type PoiAdvice = {
  recommendations: Array<{
    name: string;
    type: string;
    distance: string;
    highlights: string;
    tips: string;
  }>;
  generalAdvice: string[];
};

type SummonsAssistResult = {
  structured: StructuredSummons;
  userQuestion?: string | null;
  transport: Nullable<TransportAdvice>;
  poi: Nullable<PoiAdvice>;
  narrative: string;
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      resolve(base64);
    };
    
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsArrayBuffer(file);
  });

type OptionToggleProps = {
  label: string;
  description: string;
  active: boolean;
  onChange: (next: boolean) => void;
};

const OptionToggle = ({
  label,
  description,
  active,
  onChange,
}: OptionToggleProps) => (
  <button
    type="button"
    className={`option-toggle ${active ? "option-toggle--on" : ""}`}
    onClick={() => onChange(!active)}
    aria-pressed={active}
  >
    <div className="option-toggle__text">
      <span>{label}</span>
      <small>{description}</small>
    </div>
    <span className="option-toggle__pill">{active ? "已启用" : "已关闭"}</span>
  </button>
);

function App() {
  const [stayDuration, setStayDuration] = useState(2);
  const [includeTransport, setIncludeTransport] = useState(true);
  const [includePoi, setIncludePoi] = useState(false);
  const [pdfLabel, setPdfLabel] = useState("拖拽或点击上传传票 PDF");
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummonsAssistResult | null>(null);

  const structuredSummary = useMemo(() => {
    if (!result) return [] as Array<{ label: string; value: string }>;
    const entries: Array<{ key: keyof StructuredSummons; label: string }> = [
      { key: "caseNumber", label: "案号" },
      { key: "cause", label: "案由" },
      { key: "hearingTime", label: "开庭时间" },
      { key: "court", label: "法院" },
      { key: "courtAddress", label: "开庭地址" },
      { key: "summonedPerson", label: "被传唤人" },
    ];
    return entries.map(({ key, label }) => ({
      label,
      value: result.structured[key] ?? "未提供",
    }));
  }, [result]);

  const renderTransitItem = (item: TransitSuggestion, idx: number) => {
    if (typeof item === "string") {
      return <li key={`${item}-${idx}`}>{item}</li>;
    }
    const key = item.line ?? item.suggestion ?? idx;
    return (
      <li key={key}>
        {item.line && <strong>{item.line}</strong>}
        <span>{item.suggestion}</span>
      </li>
    );
  };

  const renderGenericSuggestion = (item: GenericSuggestion, idx: number) => {
    if (typeof item === "string") {
      return <li key={`${item}-${idx}`}>{item}</li>;
    }
    const key = item.suggestion ?? idx;
    return <li key={key}>{item.suggestion}</li>;
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPdfLabel("拖拽或点击上传传票 PDF");
      setPdfBase64(null);
      return;
    }

    if (file.type !== "application/pdf") {
      setError("仅支持 PDF 文件");
      setPdfBase64(null);
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const encoded = await readFileAsBase64(file);
      setPdfBase64(encoded);
      setPdfLabel(file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : "读取文件失败";
      setError(message);
      setPdfBase64(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!pdfBase64) {
      setError("请先上传要解析的传票 PDF");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        pdfBase64,
        stayDurationHours: stayDuration,
        includeTransport,
        includePoi,
      };

      const response = await fetch(`${API_BASE_URL}/api/summons/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.message ?? data?.error ?? "服务不可用");
      }

      if (data.status !== "ok") {
        throw new Error(data?.message ?? "解析失败");
      }

      setResult(data.data as SummonsAssistResult);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "请求失败，请稍后重试";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="workspace">
        <div className="workspace__content">
          <div className="workspace__scroll">
            <header className="workspace__header">
              <div>
                <p className="eyebrow">智能传票助理 · Mastra</p>
                <h1>上传传票，生成行程建议</h1>
                <p className="subtitle">
                  上传法院传票，设定停留时间并选择需要的辅助信息，即可获取交通与周边待办建议。
                </p>
              </div>
            </header>

            <section className="surface-card uploader">
              <label className="upload-drop" htmlFor="pdf-input">
                <input
                  id="pdf-input"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                />
                <div>
                  <p>{pdfLabel}</p>
                  <small>
                    {isUploading
                      ? "读取中…"
                      : "我们只在客户端短暂保存文件，随后编码上传至 Mastra 接口。"}
                  </small>
                </div>
              </label>

              <div className="options-grid">
                <div className="stay-control">
                  <div>
                    <span>可利用时间</span>
                    <small>预计在法院附近停留的小时数</small>
                  </div>
                  <div className="stay-control__slider">
                    <input
                      type="range"
                      min={0.5}
                      max={6}
                      step={0.5}
                      value={stayDuration}
                      onChange={(e) => setStayDuration(Number(e.target.value))}
                    />
                    <span>{stayDuration.toFixed(1)} 小时</span>
                  </div>
                </div>
                <OptionToggle
                  label="交通建议"
                  description="规划公共交通与自驾方案"
                  active={includeTransport}
                  onChange={setIncludeTransport}
                />
                <OptionToggle
                  label="周边地点"
                  description="推荐等候期间的咖啡/景点"
                  active={includePoi}
                  onChange={setIncludePoi}
                />
              </div>

              <div className="uploader__actions">
                <span>准备就绪后点击生成即可获得交通与周边待办建议。</span>
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleSubmit}
                  disabled={loading || !pdfBase64}
                >
                  {loading ? "生成中…" : "生成建议"}
                </button>
              </div>
            </section>

            {error && <p className="status status--error">{error}</p>}
            {!error && loading && <p className="status">正在调用 Mastra 工作流…</p>}

            {result && (
              <section className="results">
                {/* <div className="result-card narrative-card">
                  <h3>📝 汇总说明</h3>
                  <pre>{result.narrative}</pre>
                </div> */}

                <div className="result-card">
                  <h3>📄 传票信息</h3>
                  <ul>
                    {structuredSummary.map(({ label, value }) => (
                      <li key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                {result.transport && (
                  <div className="result-card">
                    <h3>🚉 交通建议</h3>
                    {result.transport.bestArrivalWindow && (
                      <p className="highlight">
                        建议抵达：{result.transport.bestArrivalWindow}
                      </p>
                    )}
                    <div className="list-columns">
                      <div>
                        <strong>公共交通</strong>
                        <ul>
                          {result.transport.publicTransit.map((item, idx) =>
                            renderTransitItem(item, idx)
                          )}
                        </ul>
                      </div>
                      <div>
                        <strong>自驾 / 停车</strong>
                        <ul>
                          {result.transport.driving.map((item, idx) =>
                            renderGenericSuggestion(item, idx)
                          )}
                        </ul>
                      </div>
                      <div>
                        <strong>打车 / 网约车</strong>
                        <ul>
                          {result.transport.taxiOrRideHailing.map((item, idx) =>
                            renderGenericSuggestion(item, idx)
                          )}
                        </ul>
                      </div>
                    </div>
                    {!!result.transport.notes.length && (
                      <div>
                        <strong>注意事项</strong>
                        <ul>
                          {result.transport.notes.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {result.poi && result.poi.recommendations.length > 0 && (
                  <div className="result-card">
                    <h3>📍 周边推荐</h3>
                    <ul className="poi-list">
                      {result.poi.recommendations.map((rec) => (
                        <li key={rec.name}>
                          <strong>{rec.name}</strong>
                          <span>
                            {rec.type} · {rec.distance}
                          </span>
                          <small>亮点：{rec.highlights}</small>
                          <small>贴士：{rec.tips}</small>
                        </li>
                      ))}
                    </ul>
                    {!!result.poi.generalAdvice.length && (
                      <div className="general-advice">
                        {result.poi.generalAdvice.map((tip) => (
                          <span key={tip}>{tip}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;
