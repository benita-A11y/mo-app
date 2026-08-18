/* ============================================================
   「墨」· LLM 客户端层
   支持 DeepSeek / 豆包（火山方舟）/ 自定义 OpenAI 兼容端点
   ------------------------------------------------------------
   配置存于 store.settings.ai = {
     enabled, provider, apiKey, baseUrl, model
   }
   所有调用失败时返回 null，由上层回退到规则引擎。
   ============================================================ */
'use strict';

const LLM = (() => {

  const PROVIDERS = {
    deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', tip: '在 DeepSeek 开放平台创建 API Key' },
    doubao: { name: '豆包（火山方舟）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '', tip: '模型填推理接入点 ID（ep-…）或模型名，如 doubao-seed-1-6-250615' },
    custom: { name: '自定义（OpenAI 兼容）', baseUrl: '', model: '', tip: '填入任意 OpenAI 兼容服务的 Base URL 与模型名' }
  };

  function cfg() {
    const store = Store.load();
    return store.settings.ai || {};
  }

  /** AI 是否已启用且配置了 Key */
  function isEnabled() {
    const c = cfg();
    return !!(c && c.enabled && c.apiKey && c.apiKey.trim());
  }

  function providerName(p) { return (PROVIDERS[p] || {}).name || p; }

  /**
   * 调用对话补全接口
   * @param {{role:string,content:string}[]} messages
   * @param {{temperature?:number, maxTokens?:number, json?:boolean, timeout?:number}} opts
   * @returns {Promise<string|null>} 失败返回 null
   */
  async function chat(messages, opts = {}) {
    if (!isEnabled()) return null;
    const c = cfg();
    const prov = PROVIDERS[c.provider] || PROVIDERS.custom;
    const baseUrl = (c.baseUrl || prov.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) return null;
    const model = c.model || prov.model;
    if (!model) return null;

    const body = {
      model,
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 900,
      stream: false
    };
    if (opts.json) {
      body.response_format = { type: 'json_object' };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 20000);
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.apiKey.trim()}`
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!res.ok) {
        console.warn('[LLM] HTTP', res.status, await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (opts.json) return extractJson(text);
      return text || null;
    } catch (e) {
      console.warn('[LLM] 调用失败：', e.message || e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 从模型输出中提取 JSON 对象（兼容 ```json 包裹 与 前后杂文本） */
  function extractJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) {}
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1]); } catch (_) {} }
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try { return JSON.parse(text.slice(s, e + 1)); } catch (_) {}
    }
    return null;
  }

  /** 测试连接 */
  async function test() {
    const ok = await chat([
      { role: 'system', content: '你是连接测试助手。' },
      { role: 'user', content: '请只回复两个字：连接成功' }
    ], { maxTokens: 20, temperature: 0, timeout: 12000 });
    return ok !== null;
  }

  return { chat, test, isEnabled, cfg, PROVIDERS, providerName };
})();
