"""
CRUD 模块网关
统一暴露提取出各个垂直领域的模块函数，保证外部路由层的平滑过渡与向后兼容。
"""

from .common import *
from .user import *
from .word import *
from .progress import *
from .quiz import *
from .mistake import *
from .review import *
