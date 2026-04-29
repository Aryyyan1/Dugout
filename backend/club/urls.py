from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, ClubTableViewSet, BookingViewSet, TransactionViewSet, AnnouncementViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'tables', ClubTableViewSet)
router.register(r'bookings', BookingViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'announcements', AnnouncementViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
