"""
DroneCommand AI — API URL Configuration

Birincil endpoint: POST /api/drones/register/
Yardımcı endpoint'ler: GET /api/drones/, logs/, scans/, status/
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'drones', views.DroneViewSet, basename='drone')
router.register(r'logs', views.LogEntryViewSet, basename='log')
router.register(r'scans', views.ScanSessionViewSet, basename='scan')

urlpatterns = [
    path('', include(router.urls)),
    path('drones/register/', views.DroneRegistrationView.as_view(), name='drone-register'),
    path('status/', views.system_status, name='system-status'),
]
