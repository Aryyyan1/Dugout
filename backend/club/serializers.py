from rest_framework import serializers
from .models import User, ClubTable, Booking, Transaction, Announcement

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'is_manager', 'is_approved', 'phone_number']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        instance = self.Meta.model(**validated_data)
        if password is not None:
            instance.set_password(password)
        instance.save()
        return instance

class ClubTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClubTable
        fields = '__all__'

class BookingSerializer(serializers.ModelSerializer):
    user_name = serializers.ReadOnlyField(source='user.username')
    table_name = serializers.ReadOnlyField(source='table.name')

    class Meta:
        model = Booking
        fields = '__all__'

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'

class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = '__all__'
