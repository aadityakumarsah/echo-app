from app.core.redis import get_redis

def put(key: str, value: str) -> bool:
    """Store a key-value pair in Redis"""
    try:
        redis_client = get_redis()
        redis_client.set(key, value)
        return True
    except Exception as e:
        print(f"Error putting data to Redis: {e}")
        return False

def get(key: str) -> str:
    """Get a value from Redis by key"""
    try:
        redis_client = get_redis()
        value = redis_client.get(key)
        return value
    except Exception as e:
        print(f"Error getting data from Redis: {e}")
        return None
