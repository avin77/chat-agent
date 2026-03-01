$filepath = 'C:\Coding\EzyBot\ezybot\src\app\dashboard\page.tsx'
$content = [System.IO.File]::ReadAllText($filepath, [System.Text.Encoding]::UTF8)
Write-Host ("File read, length: " + $content.Length)

# Edit A: Add getProductHealthMetrics to imports
$oldA = "    getConversationsWithLogCounts,`n} from './actions';"
$newA = "    getConversationsWithLogCounts,`n    getProductHealthMetrics,`n} from './actions';"
if (-not $content.Contains($oldA)) { throw "Edit A: pattern not found" }
$content = $content.Replace($oldA, $newA)
Write-Host "Edit A: done"

# Edit C: Add productHealth state and update activeTab type
$oldC = "    const [loading, setLoading] = useState(true);`n    const [activeTab, setActiveTab] = useState<'overview' | 'eval' | 'prompt_quality' | 'conversations' | 'llm_logs'>('overview');"
$newC = "    const [productHealth, setProductHealth] = useState<ProductHealth | null>(null);`n    const [loading, setLoading] = useState(true);`n    const [activeTab, setActiveTab] = useState<'overview' | 'eval' | 'prompt_quality' | 'conversations' | 'llm_logs' | 'product_health'>('overview');"
if (-not $content.Contains($oldC)) { throw "Edit C: pattern not found" }
$content = $content.Replace($oldC, $newC)
Write-Host "Edit C: done"

# Edit D: Update Promise.all
$oldD = "        const [s, i, f, c, e, ev, rq, ch] = await Promise.all([`n            getDashboardStats(days),`n            getIntentBreakdown(days),`n            getFlowFunnel(days),`n            getRecentConversations(30),`n            getErrorMetrics(days),`n            getLatestEvalResults(),`n            getResponseQualityMetrics(days),`n            getConversationHealthMetrics(days),`n        ]);`n        setStats(s);`n        setIntents(i);`n        setFunnel(f);`n        setConversations(c);`n        setErrors(e);`n        setEvalResults(ev);`n        setResponseQuality(rq);`n        setConvHealth(ch);"
$newD = "        const [s, i, f, c, e, ev, rq, ch, ph] = await Promise.all([`n            getDashboardStats(days),`n            getIntentBreakdown(days),`n            getFlowFunnel(days),`n            getRecentConversations(30),`n            getErrorMetrics(days),`n            getLatestEvalResults(),`n            getResponseQualityMetrics(days),`n            getConversationHealthMetrics(days),`n            getProductHealthMetrics(days),`n        ]);`n        setStats(s);`n        setIntents(i);`n        setFunnel(f);`n        setConversations(c);`n        setErrors(e);`n        setEvalResults(ev);`n        setResponseQuality(rq);`n        setConvHealth(ch);`n        setProductHealth(ph);"
if (-not $content.Contains($oldD)) { throw "Edit D: pattern not found" }
$content = $content.Replace($oldD, $newD)
Write-Host "Edit D: done"

# Edit E: Add product_health to tabs array
$oldE = "{(['overview', 'eval', 'prompt_quality', 'conversations', 'llm_logs'] as const).map((tab) => ("
$newE = "{(['overview', 'eval', 'prompt_quality', 'conversations', 'llm_logs', 'product_health'] as const).map((tab) => ("
if (-not $content.Contains($oldE)) { throw "Edit E: pattern not found" }
$content = $content.Replace($oldE, $newE)
Write-Host "Edit E: done"

# Edit F: Add product_health label
$oldF = "{tab === 'overview' ? 'Overview' : tab === 'eval' ? 'Eval Results' : tab === 'prompt_quality' ? 'Prompt Quality' : tab === 'llm_logs' ? 'LLM I/O' : 'Conversations'}"
$newF = "{tab === 'overview' ? 'Overview' : tab === 'eval' ? 'Eval Results' : tab === 'prompt_quality' ? 'Prompt Quality' : tab === 'llm_logs' ? 'LLM I/O' : tab === 'product_health' ? 'Product Health' : 'Conversations'}"
if (-not $content.Contains($oldF)) { throw "Edit F: pattern not found" }
$content = $content.Replace($oldF, $newF)
Write-Host "Edit F: done"

[System.IO.File]::WriteAllText($filepath, $content, [System.Text.Encoding]::UTF8)
Write-Host ("File saved. New length: " + $content.Length)
