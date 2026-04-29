from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import User, ClubTable, Booking, Transaction, Announcement
from .serializers import UserSerializer, ClubTableSerializer, BookingSerializer, TransactionSerializer, AnnouncementSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

    @action(detail=False, methods=['post'])
    def login(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        try:
            user = User.objects.get(username=username)
            if user.check_password(password):
                return Response({
                    'id': user.id,
                    'username': user.username,
                    'is_manager': user.is_manager,
                    'is_approved': user.is_approved,
                    'email': user.email
                })
            else:
                return Response({'error': 'Invalid password'}, status=status.HTTP_401_UNAUTHORIZED)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        user = self.get_object()
        user.is_approved = True
        user.save()
        return Response({'status': 'user approved'})

class ClubTableViewSet(viewsets.ModelViewSet):
    queryset = ClubTable.objects.all()
    serializer_class = ClubTableSerializer
    permission_classes = [permissions.AllowAny]

    @action(detail=True, methods=['post'])
    def start_game(self, request, pk=None):
        table = self.get_object()
        if not table.is_free:
            return Response({'error': 'Table is already in use'}, status=status.HTTP_400_BAD_REQUEST)
        
        from django.utils import timezone
        table.is_free = False
        table.last_start_time = timezone.now()
        table.save()
        return Response({'status': 'game started', 'start_time': table.last_start_time})

    @action(detail=True, methods=['post'])
    def stop_game(self, request, pk=None):
        table = self.get_object()
        if table.is_free:
            return Response({'error': 'Table is not in use'}, status=status.HTTP_400_BAD_REQUEST)
        
        from django.utils import timezone
        now = timezone.now()
        start = table.last_start_time
        
        amount = 0
        total_seconds = 0
        
        if not start:
            # Fallback if somehow last_start_time is null
            table.is_free = True
            table.save()
            return Response({'status': 'table reset', 'amount': 0})

        duration = now - start
        total_seconds = duration.total_seconds()
        duration_hours = total_seconds / 3600
        amount = float(table.hourly_rate) * duration_hours
        
        table.is_free = True
        table.last_start_time = None
        table.save()
        
        # Log the transaction
        tx = Transaction.objects.create(
            amount=amount,
            table=table,
            description=f"Game session on {table.name} for {int(total_seconds)} seconds",
            duration=int(total_seconds)
        )
        
        return Response({
            'status': 'game stopped', 
            'total_seconds': int(total_seconds),
            'amount': round(amount, 2),
            'transaction_id': tx.id
        })

class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        table_id = request.data.get('table')
        start_time_str = request.data.get('start_time')
        
        if table_id and start_time_str:
            from datetime import timedelta
            from django.utils.dateparse import parse_datetime
            from django.utils import timezone
            start_time = parse_datetime(start_time_str)
            if start_time:
                if start_time < timezone.now():
                    return Response(
                        {'error': 'Cannot schedule a booking for a time that has already passed.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                conflicts = Booking.objects.filter(
                    table_id=table_id,
                    status='APPROVED',
                    start_time__gte=start_time - timedelta(minutes=59),
                    start_time__lte=start_time + timedelta(minutes=59)
                )
                if conflicts.exists():
                    return Response(
                        {'error': 'This table is already reserved for a conflicting time slot.'},
                        status=status.HTTP_409_CONFLICT
                    )
        
        return super().create(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        booking = self.get_object()

        from datetime import timedelta
        conflicts = Booking.objects.filter(
            table=booking.table,
            status='APPROVED',
            start_time__gte=booking.start_time - timedelta(minutes=59),
            start_time__lte=booking.start_time + timedelta(minutes=59)
        ).exclude(id=booking.id)
        
        if conflicts.exists():
            return Response(
                {'error': 'Cannot approve. This table already has an approved booking for this time slot.'},
                status=status.HTTP_409_CONFLICT
            )

        booking.status = 'APPROVED'
        booking.save()
        
        # Log transaction for the booking approval
        Transaction.objects.create(
            booking=booking,
            table=booking.table,
            amount=0, # Approval itself is free, billing happens when game starts
            description=f"Reservation for {booking.table.name} by {booking.user.username} approved for {booking.start_time.strftime('%I:%M %p')}",
            duration=0
        )
        return Response({'status': 'booking approved', 'booking_id': booking.id})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        booking = self.get_object()
        booking.status = 'CANCELLED'
        booking.save()
        return Response({'status': 'booking rejected'})

class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [permissions.AllowAny]

    @action(detail=True, methods=['patch'])
    def update_name(self, request, pk=None):
        tx = self.get_object()
        user_name = request.data.get('user_name')
        if user_name:
            # We convert "Game session on Snooker 1 for 3600 seconds" to include the user
            if "Paid by:" not in tx.description:
                tx.description = f"{tx.description} - Paid by: {user_name}"
                tx.save()
        return Response({'status': 'updated'})

    @action(detail=True, methods=['patch'])
    def update_payment(self, request, pk=None):
        tx = self.get_object()
        status = request.data.get('payment_status')
        if status in ['PAID', 'UNPAID']:
            tx.payment_status = status
            tx.save()
            return Response({'status': 'payment status updated'})
        return Response({'error': 'Invalid status'}, status=400)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        from django.db.models import Sum, Count
        from django.utils import timezone
        from datetime import timedelta
        
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        today_revenue = Transaction.objects.filter(timestamp__gte=today_start).aggregate(Sum('amount'))['amount__sum'] or 0
        month_revenue = Transaction.objects.filter(timestamp__gte=month_start).aggregate(Sum('amount'))['amount__sum'] or 0
        
        # Table performance
        tables_perf = []
        for table in ClubTable.objects.all():
            table_rev = Transaction.objects.filter(table=table).aggregate(Sum('amount'))['amount__sum'] or 0
            tables_perf.append({
                'name': table.name,
                'revenue': float(table_rev)
            })
        
        # Daily revenue for last 7 days
        daily_stats = []
        for i in range(7):
            date = (now - timedelta(days=i)).date()
            day_rev = Transaction.objects.filter(timestamp__date=date).aggregate(Sum('amount'))['amount__sum'] or 0
            daily_stats.append({
                'date': date.strftime('%a'),
                'revenue': float(day_rev)
            })
            
        return Response({
            'today_revenue': round(float(today_revenue), 2),
            'month_revenue': round(float(month_revenue), 2),
            'daily_stats': daily_stats[::-1],
            'tables_perf': tables_perf
        })
class AnnouncementViewSet(viewsets.ModelViewSet):
    queryset = Announcement.objects.all().order_by('-created_at')
    serializer_class = AnnouncementSerializer
    permission_classes = [permissions.AllowAny]
