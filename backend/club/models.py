from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

class User(AbstractUser):
    email = models.EmailField(unique=True)
    is_manager = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)
    phone_number = models.CharField(max_length=15, unique=True, blank=True, null=True)
    is_looking_for_game = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.username} ({'Manager' if self.is_manager else 'Member'})"

class ClubTable(models.Model):
    TABLE_TYPES = (
        ('SNOOKER', 'Snooker'),
        ('POOL', 'Pool'),
    )
    name = models.CharField(max_length=50)
    table_type = models.CharField(max_length=10, choices=TABLE_TYPES)
    is_free = models.BooleanField(default=True)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=200.00)
    last_start_time = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} - {self.table_type} ({'Free' if self.is_free else 'Busy'})"

class Booking(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('CANCELLED', 'Cancelled'),
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bookings')
    table = models.ForeignKey(ClubTable, on_delete=models.CASCADE, related_name='bookings')
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    is_active = models.BooleanField(default=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    estimated_time = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"Booking by {self.user.username} on {self.table.name}"

class Transaction(models.Model):
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='transactions', null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=255)
    table = models.ForeignKey(ClubTable, on_delete=models.SET_NULL, null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    duration = models.IntegerField(default=0)
    PAYMENT_CHOICES = (
        ('PAID', 'Paid'),
        ('UNPAID', 'Unpaid'),
    )
    payment_status = models.CharField(max_length=10, choices=PAYMENT_CHOICES, default='UNPAID')

    def __str__(self):
        return f"Transaction: {self.amount} - {self.description}"

class Announcement(models.Model):
    TYPES = (
        ('NEWS', 'Club News'),
        ('RULE', 'Club Rules'),
        ('EVENT', 'Tournament/Event'),
    )
    title = models.CharField(max_length=100)
    content = models.TextField()
    ann_type = models.CharField(max_length=10, choices=TYPES, default='NEWS')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"[{self.ann_type}] {self.title}"

