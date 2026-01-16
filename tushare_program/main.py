import tushare as ts
import pandas as pd
from supabase import create_client
import os
from datetime import date

# ===== 1. 配置 =====
# ⚠️ 注意：不要泄露你的 Token，建议后续放入环境变量
TUSHARE_TOKEN = "82a45f0dc0cc4afda262bafa75ad6aae783b5666510752187065090432d1"
SUPABASE_URL = "https://zricjhieabqkgscqpnpp.supabase.co"
# 如果 upsert 报错权限不足，请这里换成 service_role key
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyaWNqaGllYWJxa2dzY3FwbnBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ1NDczNywiZXhwIjoyMDg0MDMwNzM3fQ.kHrZ0iM9RcMohgYbYFG7frA_GqZKUyJs8aA-X4qFnF8"

# ===== 2. 初始化 =====
ts.set_token(TUSHARE_TOKEN)
pro = ts.pro_api()

pro._DataApi__token = TUSHARE_TOKEN  # (ts.set_token 已经做过了，这行多余但无害)
# 不要手动覆盖 pro._DataApi__http_url；使用默认官方地址即可

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ===== 3. 拉取行情 =====
# 20260106 是周二，应该是交易日。
# ⚠️ 注意：如果你是 Tushare 免费用户，可能拉取不到最近的数据（有延迟），建议先试一个去年的旧日期确认代码通畅
# 默认取当天日期；也可以通过环境变量 TRADE_DATE=YYYYMMDD 手动指定
trade_date = os.getenv("TRADE_DATE") or date.today().strftime("%Y%m%d")

try:
    print(f"正在从 Tushare 拉取 {trade_date} 的数据...")
    df = pro.daily(trade_date=trade_date)
except Exception as e:
    print(f"Tushare 接口报错: {e}")
    df = pd.DataFrame() # 设为空防止后面崩

print("拉取到行数：", len(df))

# ===== 4. 写入逻辑（增加空值判断） =====
if not df.empty:
    # 数据清洗
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date.astype(str)
    # 替换 NaN 为 None，因为 JSON 标准不支持 NaN
    df = df.where(pd.notnull(df), None)
    
    records = df.to_dict(orient="records")

    try:
        print("正在写入 Supabase...")
        response = supabase.table("equity_daily").upsert(records).execute()
        print("写入完成！")
    except Exception as e:
        print(f"Supabase 写入失败: {e}")
        print("提示：如果是 401/Permission 错误，请检查是否使用了 Service Role Key")
else:
    print("没有获取到数据，跳过数据库写入。")