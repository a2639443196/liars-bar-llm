from openai import OpenAI

API_BASE_URL = "http://116.196.117.30:3000/v1"  # 去掉 /chat/completions
API_KEY = "sk-Ea6XIuVezjgVfC3o01LsMsmwKQWp5x29i06zUayLu2n6tjWo"


class LLMClient:
    def __init__(self, api_key=API_KEY, base_url=API_BASE_URL):
        """初始化LLM客户端"""
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url
        )

    def chat(self, messages, model="moonshotai/Kimi-K2-Instruct-0905"):
        """与LLM交互"""
        try:
            print(f"LLM请求: {messages}")
            response = self.client.chat.completions.create(
                model=model,
                messages=messages
            )

            if response.choices:
                message = response.choices[0].message
                content = message.content or ""
                reasoning_content = getattr(message, "reasoning_content", "")
                print(f"LLM推理内容: {content}")
                return content, reasoning_content

            return "", ""

        except Exception as e:
            print(f"LLM调用出错: {str(e)}")
            return "", ""


if __name__ == "__main__":
    llm = LLMClient()
    messages = [{"role": "user", "content": "你好"}]
    response = llm.chat(messages)
    print(f"响应: {response}")
